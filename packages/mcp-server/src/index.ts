#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadScenarioFile } from './scenario-file'
import { createDashboardClient } from './dashboard-client'
import { formatContext, formatDefectList, formatPatch } from './format'
import { readCommandSource, runInstallCommands, toPromptText } from './commands'

/**
 * Inspector-Agent MCP 서버 (stdio).
 * 에이전트는 "눈"이 아니라 이미 탐지·매핑·측정된 결함을 받아 패치만 제안한다.
 * 파일 반영은 기본적으로 대시보드에서 사람이 승인한다 (INSPECTOR_ALLOW_AGENT_APPLY=1 이면 에이전트 적용 허용).
 */

interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const dashboardUrl = process.env.INSPECTOR_DASHBOARD_URL ?? 'http://localhost:3000'
const allowAgentApply = process.env.INSPECTOR_ALLOW_AGENT_APPLY === '1'
const client = createDashboardClient(dashboardUrl)
const server = new McpServer({ name: 'inspector-agent', version: '0.1.0' })

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] })

/** 대시보드 오류를 예외 대신 도구 오류 응답으로 바꿔 에이전트가 스스로 복구하게 한다 */
const run = async (task: () => Promise<string>): Promise<ToolResult> => {
  try {
    return text(await task())
  } catch (error) {
    return { ...text((error as Error).message), isError: true }
  }
}

server.registerTool(
  'scan_page',
  {
    title: '페이지 스캔',
    description:
      '헤드리스 Chromium 으로 URL 을 여러 뷰포트에서 스캔해 레이아웃 오버플로우와 모달·드롭다운 가려짐 결함을 결정론적으로 탐지하고 대시보드에 저장합니다. 데이터가 있어야 그려지는 화면이나 클릭해야 열리는 드롭다운·모달은 scenario(또는 scenarioFile)로 시드 데이터와 클릭·입력·대기 단계를 줘서 그 상태로 스캔하세요. 같은 시나리오가 패치 후 재측정에도 쓰입니다.',
    inputSchema: {
      url: z.string().url().describe('스캔할 개발 서버 URL (예: http://localhost:5173/)'),
      viewports: z.array(z.number().int().min(240).max(3840)).optional().describe('뷰포트 너비 목록. 기본 [375, 768, 1280]'),
      scenario: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('시나리오 JSON: { seed: { localStorage, sessionStorage, cookies }, steps: [{ action: "click"|"hover"|"fill"|"wait", ... }] }. 비밀번호나 토큰은 넣지 마세요'),
      scenarioFile: z.string().optional().describe('시나리오 JSON 파일 경로(.json, 작업 폴더 기준). 예: docs/scenarios/example-open-menu.json. scenario 와 함께 줄 수 없습니다')
    }
  },
  ({ url, viewports, scenario, scenarioFile }): Promise<ToolResult> =>
    run(async (): Promise<string> => {
      if (scenario && scenarioFile) throw new Error('scenario 와 scenarioFile 은 하나만 지정하세요.')
      const resolved = scenarioFile ? await loadScenarioFile(scenarioFile) : scenario
      const result = await client.scan(url, viewports?.map((width) => ({ width, height: 900 })), resolved)
      const defects = await client.listDefects('open')
      return `결함 ${result.defects}건 탐지 (신규 ${result.created}, 해소 ${result.resolved})\n\n미해결 목록:\n${formatDefectList(defects)}`
    })
)

server.registerTool(
  'list_defects',
  {
    title: '결함 목록',
    description: '대시보드에 저장된 결함을 심각도 순으로 한 줄씩 요약합니다. 같은 소스 위치·뷰포트의 결함은 URL 이 달라도 한 줄로 묶고 발생 URL 을 urls= 로 보여 줍니다(한 곳만 고치면 됩니다).',
    inputSchema: {
      status: z.enum(['open', 'patched', 'resolved']).optional().describe('상태 필터. 기본은 전체')
    }
  },
  ({ status }): Promise<ToolResult> =>
    run(async (): Promise<string> => formatDefectList(await client.listDefects(status)))
)

server.registerTool(
  'get_defect_context',
  {
    title: '결함 컨텍스트',
    description:
      '결함 하나의 압축 런타임 페이로드(수치, 노드/부모 레이아웃 스타일), 템플릿 라인 스니펫, 노드·부모·자식 클래스를 대상으로 하는 SCSS 규칙과 라인 번호, 결정론적 진단 제안을 반환합니다. 패치 작성 전에 반드시 호출하세요.',
    inputSchema: {
      defectId: z.string().describe('list_defects 가 반환한 결함 id (d_ 로 시작)')
    }
  },
  ({ defectId }): Promise<ToolResult> => run(async (): Promise<string> => formatContext(await client.getContext(defectId)))
)

server.registerTool(
  'propose_patch',
  {
    title: '패치 제안',
    description:
      '결함을 고치는 소스 편집을 제안합니다. 파일은 바로 바뀌지 않고, 대시보드에서 사람이 Diff 를 검토한 뒤 적용합니다. 적용 시 같은 뷰포트에서 재측정해 오버플로우 또는 가려진 비율이 0이 아니거나 새 결함이 생기면 자동 롤백됩니다.',
    inputSchema: {
      defectId: z.string(),
      file: z.string().describe('대상 프로젝트 루트 기준 경로 (get_defect_context 의 소스 경로)'),
      edits: z
        .array(
          z.object({
            oldText: z.string().min(1).describe('파일 안에서 정확히 한 번 등장하는 원문'),
            newText: z.string().describe('바꿀 내용')
          })
        )
        .min(1),
      rationale: z.string().describe('원인과 수정 이유 (한국어 한두 문장)')
    }
  },
  ({ defectId, file, edits, rationale }): Promise<ToolResult> =>
    run(async (): Promise<string> =>
      formatPatch(await client.proposePatch({ defectId, file, edits, rationale }), dashboardUrl)
    )
)

server.registerTool(
  'get_patch_status',
  {
    title: '패치 상태',
    description: '패치의 검토/적용 상태와 재측정 결과(전후 px, 회귀 결함)를 확인합니다. 실패했다면 회귀 정보를 바탕으로 새 패치를 제안하세요.',
    inputSchema: {
      patchId: z.string().describe('propose_patch 가 반환한 패치 id (p_ 로 시작)')
    }
  },
  ({ patchId }): Promise<ToolResult> => run(async (): Promise<string> => formatPatch(await client.getPatch(patchId), dashboardUrl))
)

if (allowAgentApply) {
  server.registerTool(
    'apply_patch',
    {
      title: '패치 적용 (자율 모드)',
      description: '사람 승인 없이 패치를 적용하고 재측정합니다. INSPECTOR_ALLOW_AGENT_APPLY=1 일 때만 노출됩니다.',
      inputSchema: { patchId: z.string() }
    },
    ({ patchId }): Promise<ToolResult> =>
      run(async (): Promise<string> => formatPatch(await client.applyPatch(patchId), dashboardUrl))
  )
}

// 설치 없이 쓰는 슬래시 명령. Claude Code 에서는 /mcp__inspector-agent__scan 으로 나타난다
const commandSource = await readCommandSource()
const promptResult = (args: string): { messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> } => ({
  messages: [{ role: 'user', content: { type: 'text', text: toPromptText(commandSource, args) } }]
})

server.registerPrompt(
  'scan',
  {
    title: '스캔하고 패치 제안',
    description: '개발 서버를 스캔하고 미해결 결함마다 패치를 제안합니다(파일은 직접 고치지 않음). url 을 생략하면 실행 중인 개발 서버를 찾습니다.',
    argsSchema: { url: z.string().optional().describe('스캔할 주소 (예: http://localhost:5173)') }
  },
  ({ url }) => promptResult(url ? `scan ${url}` : 'scan')
)

server.registerPrompt(
  'status',
  { title: '결함·패치 현황', description: '스캔 없이 미해결 결함과 패치 상태를 보여 줍니다.' },
  () => promptResult('status')
)

const main = async (): Promise<void> => {
  await server.connect(new StdioServerTransport())
  // stdout 은 MCP 프로토콜 전용이므로 로그는 stderr 로 남긴다
  console.error(`[inspector-agent-mcp] 대시보드 ${dashboardUrl} 에 연결된 MCP 서버가 시작되었습니다.`)
}

// `npx @inspector-agent/mcp-server install-commands` 는 서버를 띄우지 않고 슬래시 명령 파일만 설치한다
const entry = process.argv[2] === 'install-commands' ? runInstallCommands(process.argv.slice(3)).then((code): void => void (process.exitCode = code)) : main()

entry.catch((error: unknown): void => {
  console.error(error)
  process.exit(1)
})
