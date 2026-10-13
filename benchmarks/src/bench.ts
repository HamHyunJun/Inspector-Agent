import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEdits, estimateTokens, toAgentPayload } from '@inspector-agent/core'
import type { Defect } from '@inspector-agent/core'
import { buildDeclarationPatch, formatRulesCompact, locateStyleRules, readSnippet } from '@inspector-agent/source-locator'
import { measureDefect, scanPage } from '@inspector-agent/verifier'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { DESKTOP_VIEWPORT, EXPECTED_AT_MOBILE, MOBILE_VIEWPORT, NEGATIVE_CONTROLS } from './fixtures'

/**
 * Inspector-Agent 벤치마크.
 * playground 를 임시 디렉터리에 복사해 띄운 뒤 (원본은 건드리지 않는다)
 *  1) 탐지 정확도  2) 소스 매핑 정확도  3) 토큰 효율  4) 규칙 기반 자가 치유 루프 성공률 을 측정한다.
 * 실행: pnpm bench  (INSPECTOR_CHROMIUM_PATH 로 Chromium 경로 지정 가능)
 */

interface HealingAttempt {
  hint: string
  passed: boolean
  verdict: string
  afterPx: number
  regressions: number
}

interface HealingRecord {
  file: string
  beforePx: number
  healed: boolean
  attempts: HealingAttempt[]
}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const playgroundRoot = join(repoRoot, 'apps/playground')
const executablePath = process.env.INSPECTOR_CHROMIUM_PATH || undefined
const PORT = 5199

const LAYOUT_PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'min-width', 'max-width', 'flex-direction', 'flex-wrap',
  'flex-grow', 'flex-shrink', 'flex-basis', 'grid-template-columns', 'column-gap', 'white-space',
  'word-break', 'overflow-wrap', 'overflow-x', 'text-overflow', 'padding-left', 'padding-right',
  'margin-left', 'margin-right'
]

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

const preparePlayground = async (): Promise<string> => {
  const workdir = await mkdtemp(join(tmpdir(), 'inspector-bench-'))
  await cp(playgroundRoot, workdir, {
    recursive: true,
    filter: (source): boolean => !source.includes('node_modules') && !source.includes('/dist')
  })
  await symlink(join(playgroundRoot, 'node_modules'), join(workdir, 'node_modules'), 'dir')
  // 복사본 위치에서는 모노레포 tsconfig.base.json 상속 경로가 깨지므로 독립 tsconfig 로 바꾼다
  const base = JSON.parse(await readFile(join(repoRoot, 'tsconfig.base.json'), 'utf8')) as { compilerOptions: object }
  const own = JSON.parse(await readFile(join(playgroundRoot, 'tsconfig.json'), 'utf8')) as { compilerOptions: object; include: string[] }
  await writeFile(
    join(workdir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { ...base.compilerOptions, ...own.compilerOptions }, include: own.include })
  )
  return workdir
}

const startServer = async (root: string): Promise<ViteDevServer> => {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true } })
  await server.listen()
  return server
}

/** 같은 페이지를 "전부 넘기는" 방식으로 LLM 에 줬을 때의 토큰 수를 잰다 */
const measureRawTokens = async (url: string): Promise<{ domHtml: number; domLayoutStyles: number; domFullStyles: number }> => {
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage({ viewport: MOBILE_VIEWPORT })
    await page.goto(url, { waitUntil: 'networkidle' })
    const sizes = await page.evaluate((properties: string[]): { html: number; layout: number; full: number } => {
      const elements = Array.from(document.body.querySelectorAll('*'))
      let layout = 0
      let full = 0
      for (const element of elements) {
        const style = getComputedStyle(element)
        const picked: Record<string, string> = {}
        for (const property of properties) picked[property] = style.getPropertyValue(property)
        layout += JSON.stringify(picked).length
        const all: Record<string, string> = {}
        for (let i = 0; i < style.length; i++) {
          const property = style.item(i)
          all[property] = style.getPropertyValue(property)
        }
        full += JSON.stringify(all).length
      }
      return { html: document.body.outerHTML.length, layout: layout + document.body.outerHTML.length, full: full + document.body.outerHTML.length }
    }, LAYOUT_PROPERTIES)
    return { domHtml: Math.ceil(sizes.html / 4), domLayoutStyles: Math.ceil(sizes.layout / 4), domFullStyles: Math.ceil(sizes.full / 4) }
  } finally {
    await browser.close()
  }
}

/** 대시보드 context API 와 같은 방식으로 에이전트용 컨텍스트를 만들고 토큰 수를 센다 */
const buildContextTokens = async (root: string, defect: Defect): Promise<number> => {
  const payload = toAgentPayload(defect)
  const file = defect.node.source?.file
  if (!file) return estimateTokens(JSON.stringify(payload))
  const content = await readFile(join(root, file), 'utf8')
  const rules = [
    ...locateStyleRules(content, defect.node.classes, file),
    ...locateStyleRules(content, defect.parent.classes, file),
    ...locateStyleRules(content, defect.node.childClasses, file)
  ]
  return estimateTokens([JSON.stringify(payload), readSnippet(content, defect.node.source?.line ?? 1).text, formatRulesCompact(rules)].join('\n'))
}

/**
 * 측정 기반 자가 치유 루프 (LLM 없이 규칙 기반 패치로 실행하는 기준선).
 * 진단 제안을 순서대로 적용 → 재측정 → 실패하면 원복하고 다음 제안을 시도한다.
 */
const healDefect = async (root: string, defect: Defect, baseline: Defect[]): Promise<HealingRecord> => {
  const file = defect.node.source?.file ?? ''
  const record: HealingRecord = { file, beforePx: defect.metrics.overflowPx, healed: false, attempts: [] }
  const path = join(root, file)
  const original = await readFile(path, 'utf8')

  for (const suggestion of defect.suggestions) {
    const isNode = suggestion.target === 'node'
    const snapshot = isNode ? defect.node : defect.parent
    const rules = locateStyleRules(original, snapshot.classes, file)
    const patch = buildDeclarationPatch(original, rules, snapshot.classes, suggestion.declarations)
    if (!patch.ok) {
      record.attempts.push({ hint: suggestion.hint, passed: false, verdict: patch.error, afterPx: defect.metrics.overflowPx, regressions: 0 })
      continue
    }
    const applied = applyEdits(original, patch.edits)
    if (!applied.ok) continue
    await writeFile(path, applied.content, 'utf8')
    await new Promise((done): void => {
      setTimeout(done, 500)
    })
    const result = await measureDefect(defect, baseline, { executablePath })
    record.attempts.push({
      hint: suggestion.hint,
      passed: result.passed,
      verdict: result.verdict,
      afterPx: result.afterPx,
      regressions: result.regressions.length
    })
    if (result.passed) {
      record.healed = true
      break
    }
    await writeFile(path, original, 'utf8')
  }

  // 다음 결함 측정에 영향을 주지 않도록 항상 원본으로 되돌린다
  await writeFile(path, original, 'utf8')
  return record
}

const main = async (): Promise<void> => {
  const workdir = await preparePlayground()
  const server = await startServer(workdir)
  const url = `http://localhost:${PORT}/`
  console.log(`playground 복사본: ${workdir}`)

  try {
    // 1) 탐지 정확도
    const [mobile, desktop] = await scanPage(url, [MOBILE_VIEWPORT, DESKTOP_VIEWPORT], { executablePath })
    if (!mobile || !desktop) throw new Error('스캔 결과가 비어 있습니다.')
    if (mobile.stats.scannedNodes < 10) throw new Error('playground 가 렌더링되지 않았습니다. 개발 서버 로그를 확인하세요.')
    const detectedFiles = mobile.defects.map((defect): string => defect.node.source?.file ?? defect.node.selector)
    const truePositives = EXPECTED_AT_MOBILE.filter((expected): boolean => detectedFiles.includes(expected.file))
    const falsePositives = mobile.defects.filter(
      (defect): boolean => !EXPECTED_AT_MOBILE.some((expected): boolean => expected.file === defect.node.source?.file)
    )
    const negativeHits = mobile.defects.filter((defect): boolean => NEGATIVE_CONTROLS.includes(defect.node.source?.file ?? ''))
    const hintMatches = EXPECTED_AT_MOBILE.filter((expected): boolean =>
      mobile.defects.some(
        (defect): boolean => defect.node.source?.file === expected.file && defect.suggestions[0]?.hint === expected.primaryHint
      )
    )

    // 2) 소스 매핑 정확도: 노드 자신의 data-ia-src 가 있고, 그 라인의 태그가 실제 노드 태그와 같은가
    let exactMappings = 0
    for (const defect of mobile.defects) {
      const source = defect.node.source
      if (!source?.exact) continue
      const content = await readFile(join(workdir, source.file), 'utf8')
      const line = content.split('\n')[source.line - 1] ?? ''
      if (line.slice(source.column - 1).startsWith(`<${defect.node.tag}`)) exactMappings++
    }

    // 3) 토큰 효율
    const raw = await measureRawTokens(url)
    const contextTokens: number[] = []
    for (const defect of mobile.defects) contextTokens.push(await buildContextTokens(workdir, defect))
    const totalContext = contextTokens.reduce((sum, value): number => sum + value, 0)

    // 4) 측정 기반 자가 치유 루프
    const healing: HealingRecord[] = []
    for (const defect of mobile.defects) healing.push(await healDefect(workdir, defect, mobile.defects))
    const healed = healing.filter((record): boolean => record.healed).length
    const firstTry = healing.filter((record): boolean => record.attempts[0]?.passed === true).length
    const caughtRegressions = healing.reduce(
      (sum, record): number => sum + record.attempts.filter((attempt): boolean => attempt.regressions > 0).length,
      0
    )

    const summary = {
      measuredAt: new Date().toISOString(),
      detection: {
        expected: EXPECTED_AT_MOBILE.length,
        detected: mobile.defects.length,
        recall: truePositives.length / EXPECTED_AT_MOBILE.length,
        precision: mobile.defects.length === 0 ? 1 : (mobile.defects.length - falsePositives.length) / mobile.defects.length,
        negativeControlHits: negativeHits.length,
        desktopDefects: desktop.defects.length,
        primaryHintAccuracy: hintMatches.length / EXPECTED_AT_MOBILE.length,
        scanMs: mobile.stats.durationMs,
        scannedNodes: mobile.stats.scannedNodes
      },
      sourceMapping: {
        exact: exactMappings,
        total: mobile.defects.length,
        accuracy: mobile.defects.length === 0 ? 0 : exactMappings / mobile.defects.length
      },
      tokens: {
        ...raw,
        inspectorContextTotal: totalContext,
        inspectorContextPerDefect: Math.round(totalContext / Math.max(mobile.defects.length, 1)),
        reductionVsLayoutDump: 1 - totalContext / raw.domLayoutStyles,
        reductionVsFullDump: 1 - totalContext / raw.domFullStyles
      },
      healing: {
        defects: healing.length,
        healed,
        firstTry,
        successRate: healed / Math.max(healing.length, 1),
        caughtRegressions,
        records: healing
      }
    }

    await writeFile(join(here, '../results/latest.json'), JSON.stringify(summary, undefined, 2))

    console.log('\n## 탐지 정확도 (375px)')
    console.log(`재현율 ${percent(summary.detection.recall)} · 정밀도 ${percent(summary.detection.precision)} · 대조군 오탐 ${negativeHits.length}건 · 1280px 결함 ${desktop.defects.length}건`)
    console.log(`1순위 원인 진단 일치 ${percent(summary.detection.primaryHintAccuracy)} · 노드 ${mobile.stats.scannedNodes}개 탐지 ${mobile.stats.durationMs}ms`)
    console.log('\n## 소스 매핑')
    console.log(`정확한 파일:라인:컬럼 매핑 ${exactMappings}/${mobile.defects.length}`)
    console.log('\n## 토큰 효율 (4자당 1토큰 근사)')
    console.log(`DOM HTML ${raw.domHtml} · DOM+레이아웃 스타일 ${raw.domLayoutStyles} · DOM+전체 ComputedStyle ${raw.domFullStyles}`)
    console.log(`Inspector 컨텍스트 합계 ${totalContext} (결함당 ${summary.tokens.inspectorContextPerDefect})`)
    console.log(`절감률: 레이아웃 덤프 대비 ${percent(summary.tokens.reductionVsLayoutDump)}, 전체 덤프 대비 ${percent(summary.tokens.reductionVsFullDump)}`)
    console.log('\n## 규칙 기반 자가 치유 루프 (LLM 없음)')
    for (const record of healing) {
      const trail = record.attempts.map((attempt): string => `${attempt.hint}${attempt.passed ? '✓' : '✗'}`).join(' → ')
      console.log(`- ${record.file} (+${Math.round(record.beforePx)}px): ${record.healed ? '치유' : '실패'} [${trail}]`)
    }
    console.log(`성공 ${healed}/${healing.length} (첫 시도 성공 ${firstTry}) · 재측정으로 잡아낸 회귀 ${caughtRegressions}건`)
    console.log('\n결과 파일: benchmarks/results/latest.json')
  } finally {
    await server.close()
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error: unknown): void => {
  console.error(error)
  process.exitCode = 1
})
