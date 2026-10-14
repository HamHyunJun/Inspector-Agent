#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createEngine, configFromEnv, projectRootProblem } from '@inspector-agent/engine'
import { loadScenarioFile } from './scenario-file'
import { createDashboardClient } from './dashboard-client'
import type { Backend } from './dashboard-client'
import { createEngineBackend } from './engine-backend'
import { formatContext, formatDefectList, formatPatch } from './format'
import { readCommandSource, runInstallCommands, toPromptText } from './commands'

/**
 * Inspector-Agent MCP 서버 (stdio).
 * 에이전트는 "눈"이 아니라 이미 탐지·매핑·측정된 결함을 받아 패치만 제안한다.
 * 기본(독립 모드)은 대시보드 없이 이 프로세스 안의 엔진이 스캔·저장·적용·재측정·자동 롤백을 모두 한다.
 * INSPECTOR_DASHBOARD_URL 이 있으면 대시보드 모드: 모든 일을 그 대시보드 API 에 맡긴다(기존 방식).
 * 파일 반영에는 항상 사람의 승인이 필요하다: 독립 모드는 apply_patch 호출 때 클라이언트의 승인 창(elicitation)을 띄우고,
 * 승인 창을 지원하지 않는 클라이언트에서는 터미널(inspector-agent apply) 승인이나 INSPECTOR_ALLOW_AGENT_APPLY=1 이 필요하다.
 */

interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const dashboardUrl = process.env.INSPECTOR_DASHBOARD_URL
const allowAgentApply = process.env.INSPECTOR_ALLOW_AGENT_APPLY === '1'
const engineConfig = configFromEnv()
// 독립 모드에서만 의미가 있다: 프로젝트가 아닌 폴더에서 시작됐으면 모든 도구가 이유를 알려 주고 멈춘다
const setupProblem = dashboardUrl ? undefined : projectRootProblem(engineConfig)
const client: Backend = dashboardUrl ? createDashboardClient(dashboardUrl) : createEngineBackend(createEngine(engineConfig))
const server = new McpServer({ name: 'inspector-agent', version: '0.1.0' })

/** 제안 상태의 패치를 사람이 어디서 승인하는지 안내하는 한 줄 */
const reviewHint = dashboardUrl
  ? '사람의 검토를 기다립니다: 대시보드에서 Diff 를 확인하고 「적용하고 검증」을 누르세요.'
  : '사람의 승인을 기다립니다: 위 diff 를 사용자에게 보여 주고, 승인하면 apply_patch 로 적용하세요(적용 후 같은 화면에서 재측정하고 실패하면 자동 롤백). 터미널에서는 `npx -y @inspector-agent/engine apply <패치 id>`.'

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] })

/** 대시보드 오류를 예외 대신 도구 오류 응답으로 바꿔 에이전트가 스스로 복구하게 한다 */
const run = async (task: () => Promise<string>): Promise<ToolResult> => {
  if (setupProblem) return { ...text(setupProblem), isError: true }
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
      '헤드리스 Chromium 으로 URL 을 여러 뷰포트에서 스캔해 레이아웃 오버플로우와 모달·드롭다운 가려짐 결함을 결정론적으로 탐지하고 저장소에 저장합니다. 데이터가 있어야 그려지는 화면이나 클릭해야 열리는 드롭다운·모달은 scenario(또는 scenarioFile)로 시드 데이터와 클릭·입력·대기 단계를 줘서 그 상태로 스캔하세요. 같은 시나리오가 패치 후 재측정에도 쓰입니다.',
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
    description: '저장된 결함을 심각도 순으로 한 줄씩 요약합니다. 같은 소스 위치·뷰포트의 결함은 URL 이 달라도 한 줄로 묶고 발생 URL 을 urls= 로 보여 줍니다(한 곳만 고치면 됩니다).',
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
      defectId: z.string().regex(/^d_[a-z0-9]+$/).describe('list_defects 가 반환한 결함 id (d_ 로 시작)')
    }
  },
  ({ defectId }): Promise<ToolResult> => run(async (): Promise<string> => formatContext(await client.getContext(defectId)))
)

server.registerTool(
  'propose_patch',
  {
    title: '패치 제안',
    description:
      '결함을 고치는 소스 편집을 제안합니다. 파일은 바로 바뀌지 않고, 사람이 Diff 를 검토·승인한 뒤 적용됩니다(적용은 apply_patch 또는 대시보드·터미널). 적용 시 같은 뷰포트에서 재측정해 오버플로우 또는 가려진 비율이 0이 아니거나 새 결함이 생기면 자동 롤백됩니다.',
    inputSchema: {
      defectId: z.string().regex(/^d_[a-z0-9]+$/),
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
      formatPatch(await client.proposePatch({ defectId, file, edits, rationale }), reviewHint)
    )
)

server.registerTool(
  'get_patch_status',
  {
    title: '패치 상태',
    description: '패치의 검토/적용 상태와 재측정 결과(전후 px, 회귀 결함)를 확인합니다. 실패했다면 회귀 정보를 바탕으로 새 패치를 제안하세요.',
    inputSchema: {
      patchId: z.string().regex(/^p_[a-z0-9]+$/).describe('propose_patch 가 반환한 패치 id (p_ 로 시작)')
    }
  },
  ({ patchId }): Promise<ToolResult> => run(async (): Promise<string> => formatPatch(await client.getPatch(patchId), reviewHint))
)

/**
 * 독립 모드의 적용 승인. 승인 창(elicitation)을 지원하는 클라이언트에서는 diff 를 보여 주고 사람에게 직접 묻는다.
 * 지원하지 않으면, 사람이 터미널에서 승인하거나 자율 모드(INSPECTOR_ALLOW_AGENT_APPLY=1)를 명시했을 때만 적용한다.
 */
const requestApproval = async (patchId: string): Promise<string | undefined> => {
  if (allowAgentApply) return undefined
  if (!server.server.getClientCapabilities()?.elicitation) {
    return `이 MCP 클라이언트는 승인 창을 띄울 수 없어 적용하지 않았습니다. 사용자에게 터미널에서 \`npx -y @inspector-agent/engine apply ${patchId}\` 를 실행해 승인하도록 안내하세요(자율 모드는 INSPECTOR_ALLOW_AGENT_APPLY=1).`
  }
  const patch = await client.getPatch(patchId)
  const answer = await server.server.elicitInput({
    message: `${patch.file} 에 패치 ${patchId} 를 적용하고 같은 화면에서 재측정할까요? 재측정에 실패하면 자동으로 원본으로 되돌립니다.\n\n${patch.diff}`,
    requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: '적용하고 재측정', default: false } }, required: ['approve'] }
  })
  return answer.action === 'accept' && answer.content?.approve === true ? undefined : '사용자가 적용을 승인하지 않았습니다. 파일은 바뀌지 않았습니다.'
}

// 대시보드 모드는 기존대로 자율 모드일 때만 노출한다(승인은 대시보드 화면에서). 독립 모드는 항상 노출하고 위 승인을 거친다
if (dashboardUrl ? allowAgentApply : true) {
  server.registerTool(
    'apply_patch',
    {
      title: dashboardUrl ? '패치 적용 (자율 모드)' : '패치 적용',
      description: dashboardUrl
        ? '사람 승인 없이 패치를 적용하고 재측정합니다. INSPECTOR_ALLOW_AGENT_APPLY=1 일 때만 노출됩니다.'
        : '제안한 패치를 사람의 승인을 받아 적용하고 같은 화면에서 재측정합니다. 재측정에 실패하거나 새 결함이 생기면 자동으로 원본으로 롤백됩니다. 사용자가 diff 를 보고 적용을 원할 때만 호출하세요.',
      inputSchema: { patchId: z.string().regex(/^p_[a-z0-9]+$/).describe('propose_patch 가 반환한 패치 id (p_ 로 시작)') },
      annotations: { destructiveHint: true }
    },
    ({ patchId }): Promise<ToolResult> =>
      run(async (): Promise<string> => {
        const refusal = dashboardUrl ? undefined : await requestApproval(patchId)
        if (refusal) return refusal
        return formatPatch(await client.applyPatch(patchId), reviewHint)
      })
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
  console.error(dashboardUrl ? `[inspector-agent-mcp] 대시보드 ${dashboardUrl} 에 연결된 MCP 서버가 시작되었습니다.` : '[inspector-agent-mcp] 대시보드 없이 독립 모드로 시작되었습니다.')
}

// `npx @inspector-agent/mcp-server install-commands` 는 서버를 띄우지 않고 슬래시 명령 파일만 설치한다
const entry = process.argv[2] === 'install-commands' ? runInstallCommands(process.argv.slice(3)).then((code): void => void (process.exitCode = code)) : main()

entry.catch((error: unknown): void => {
  console.error(error)
  process.exit(1)
})
