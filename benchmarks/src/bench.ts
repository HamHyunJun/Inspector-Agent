import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEdits, defectMagnitude, groupDefects, toAgentPayload } from '@inspector-agent/core'
import type { Defect, DefectKind, PatchEdit } from '@inspector-agent/core'
import { buildDeclarationPatch, formatRulesCompact, locateStyleRules, readSnippet } from '@inspector-agent/source-locator'
import { measureDefect, scanPage } from '@inspector-agent/verifier'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { DESKTOP_VIEWPORT, EXPECTED_AT_MOBILE, MOBILE_VIEWPORT, NEGATIVE_CONTROLS, SECOND_PAGE_QUERY } from './fixtures'
import type { ExpectedDefect } from './fixtures'
import { findDetectionRegressions } from './gate'
import { createTokenCounter } from './tokens'
import type { TokenCounter } from './tokens'

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
  unit: 'px' | 'ratio' | 'count'
  /** 진단 제안이 전부 조상/구조 변경이 필요해 규칙 기반 자동 패치 대상이 아닌 경우 */
  manualOnly: boolean
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
  // macOS 의 /var → /private/var 심볼릭 링크 때문에 Vite 모듈 id 와 root 의 상대 경로가 어긋나지 않도록 실제 경로를 쓴다
  const workdir = await realpath(await mkdtemp(join(tmpdir(), 'inspector-bench-')))
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
const measureRawTokens = async (
  url: string,
  counter: TokenCounter
): Promise<{ domHtml: number; domLayoutStyles: number; domFullStyles: number }> => {
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage({ viewport: MOBILE_VIEWPORT })
    await page.goto(url, { waitUntil: 'networkidle' })
    const dumps = await page.evaluate((properties: string[]): { html: string; layout: string; full: string } => {
      const elements = Array.from(document.body.querySelectorAll('*'))
      const layout: string[] = []
      const full: string[] = []
      for (const element of elements) {
        const style = getComputedStyle(element)
        const picked: Record<string, string> = {}
        for (const property of properties) picked[property] = style.getPropertyValue(property)
        layout.push(JSON.stringify(picked))
        const all: Record<string, string> = {}
        for (let i = 0; i < style.length; i++) {
          const property = style.item(i)
          all[property] = style.getPropertyValue(property)
        }
        full.push(JSON.stringify(all))
      }
      const html = document.body.outerHTML
      return { html, layout: [html, ...layout].join('\n'), full: [html, ...full].join('\n') }
    }, LAYOUT_PROPERTIES)
    return {
      domHtml: await counter.count(dumps.html),
      domLayoutStyles: await counter.count(dumps.layout),
      domFullStyles: await counter.count(dumps.full)
    }
  } finally {
    await browser.close()
  }
}

/** 대시보드 context API 와 같은 방식으로 에이전트용 컨텍스트를 만들고 토큰 수를 센다 */
const buildContextTokens = async (root: string, defect: Defect, counter: TokenCounter): Promise<number> => {
  const payload = toAgentPayload(defect)
  const file = defect.node.source?.file
  if (!file) return counter.count(JSON.stringify(payload))
  const content = await readFile(join(root, file), 'utf8')
  const rules = [
    ...locateStyleRules(content, defect.node.classes, file),
    ...locateStyleRules(content, defect.parent.classes, file),
    ...locateStyleRules(content, defect.node.childClasses, file)
  ]
  return counter.count([JSON.stringify(payload), readSnippet(content, defect.node.source?.line ?? 1).text, formatRulesCompact(rules)].join('\n'))
}

/**
 * 측정 기반 자가 치유 루프 (LLM 없이 규칙 기반 패치로 실행하는 기준선).
 * 진단 제안을 순서대로 적용 → 재측정 → 실패하면 원복하고 다음 제안을 시도한다.
 */
const healDefect = async (root: string, defect: Defect, baseline: Defect[], referenceEdits: PatchEdit[] = []): Promise<HealingRecord> => {
  const file = defect.node.source?.file ?? ''
  const autoPatchable = defect.suggestions.filter((suggestion): boolean => suggestion.target !== 'ancestor' && Object.keys(suggestion.declarations).length > 0)
  const record: HealingRecord = {
    file,
    unit: defect.kind === 'occluded' ? 'ratio' : defect.kind === 'focus-escape' ? 'count' : 'px',
    manualOnly: autoPatchable.length === 0,
    beforePx: defectMagnitude(defect),
    healed: false,
    attempts: []
  }
  const path = join(root, file)
  const original = await readFile(path, 'utf8')

  // 조상 요소나 구조 변경(Teleport 등)이 필요한 제안은 선언 패치로 고칠 수 없다
  for (const suggestion of autoPatchable) {
    const isNode = suggestion.target === 'node'
    const snapshot = isNode ? defect.node : defect.parent
    const rules = locateStyleRules(original, snapshot.classes, file)
    const patch = buildDeclarationPatch(original, rules, snapshot.classes, suggestion.declarations)
    if (!patch.ok) {
      record.attempts.push({ hint: suggestion.hint, passed: false, verdict: patch.error, afterPx: defectMagnitude(defect), regressions: 0 })
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

  // 규칙 기반 패치가 불가능한 결함은 참조 패치(사람이 고치는 방식)가 검증 루프를 통과하는지만 확인한다
  if (autoPatchable.length === 0 && referenceEdits.length > 0) {
    const applied = applyEdits(original, referenceEdits)
    if (applied.ok) {
      await writeFile(path, applied.content, 'utf8')
      await new Promise((done): void => {
        setTimeout(done, 500)
      })
      const result = await measureDefect(defect, baseline, { executablePath })
      record.attempts.push({ hint: 'reference-fix', passed: result.passed, verdict: result.verdict, afterPx: result.afterPx, regressions: result.regressions.length })
      record.healed = result.passed
    } else {
      record.attempts.push({ hint: 'reference-fix', passed: false, verdict: applied.error, afterPx: record.beforePx, regressions: 0 })
    }
  }

  // 다음 결함 측정에 영향을 주지 않도록 항상 원본으로 되돌린다
  await writeFile(path, original, 'utf8')
  return record
}

const main = async (): Promise<void> => {
  // 브라우저와 서버를 띄우기 전에 토큰 계측 자격 증명부터 확인한다
  const counter = await createTokenCounter()
  const workdir = await preparePlayground()
  const server = await startServer(workdir)
  const url = `http://localhost:${PORT}/`
  console.log(`playground 복사본: ${workdir}`)

  try {
    // 1) 탐지 정확도
    const [mobile, desktop] = await scanPage(url, [MOBILE_VIEWPORT, DESKTOP_VIEWPORT], { executablePath })
    if (!mobile || !desktop) throw new Error('스캔 결과가 비어 있습니다.')
    if (mobile.stats.scannedNodes < 10) throw new Error('playground 가 렌더링되지 않았습니다. 개발 서버 로그를 확인하세요.')
    const isExpected = (defect: Defect, expected: ExpectedDefect): boolean =>
      defect.node.source?.file === expected.file && defect.kind === expected.kind
    const truePositives = EXPECTED_AT_MOBILE.filter((expected): boolean => mobile.defects.some((defect): boolean => isExpected(defect, expected)))
    const falsePositives = mobile.defects.filter((defect): boolean => !EXPECTED_AT_MOBILE.some((expected): boolean => isExpected(defect, expected)))
    const negativeHits = mobile.defects.filter((defect): boolean => NEGATIVE_CONTROLS.includes(defect.node.source?.file ?? ''))
    const hintMatches = EXPECTED_AT_MOBILE.filter((expected): boolean =>
      mobile.defects.some((defect): boolean => isExpected(defect, expected) && defect.suggestions[0]?.hint === expected.primaryHint)
    )
    // 연쇄 결함: 원인 하나에 형제가 정답표대로 묶였는지 (묶이지 않으면 형제가 별개 결함으로 따로 나온다)
    const cascadeMismatches = EXPECTED_AT_MOBILE.filter((expected): boolean => {
      if (expected.cascadedCount === undefined) return false
      const found = mobile.defects.find((defect): boolean => isExpected(defect, expected))
      const cascaded = found?.kind === 'overflow-x' ? (found.metrics.cascaded?.length ?? 0) : 0
      return cascaded !== expected.cascadedCount
    }).length
    // URL 그룹: 같은 컴포넌트를 다른 URL 에서 스캔해도 한 그룹(발생 URL 2개)이어야 한다
    const [secondPage] = await scanPage(`${url}${SECOND_PAGE_QUERY}`, [MOBILE_VIEWPORT], { executablePath })
    const groups = groupDefects([...mobile.defects, ...(secondPage?.defects ?? [])])
    const groupingMismatches = EXPECTED_AT_MOBILE.filter((expected): boolean => {
      if (!expected.alsoOnSecondPage) return false
      const group = groups.find((item): boolean => isExpected(item.representative, expected))
      return new Set(group?.members.map((member): string => member.url)).size !== 2
    }).length
    const recallOf = (kind: DefectKind): number => {
      const expected = EXPECTED_AT_MOBILE.filter((item): boolean => item.kind === kind)
      return expected.filter((item): boolean => truePositives.includes(item)).length / Math.max(expected.length, 1)
    }

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
    const raw = await measureRawTokens(url, counter)
    const contextTokens: number[] = []
    for (const defect of mobile.defects) contextTokens.push(await buildContextTokens(workdir, defect, counter))
    const totalContext = contextTokens.reduce((sum, value): number => sum + value, 0)

    // 4) 측정 기반 자가 치유 루프
    const healing: HealingRecord[] = []
    for (const defect of mobile.defects) {
      const expected = EXPECTED_AT_MOBILE.find((item): boolean => isExpected(defect, item))
      healing.push(await healDefect(workdir, defect, mobile.defects, expected?.referenceEdits))
    }
    const patchable = healing.filter((record): boolean => !record.manualOnly)
    const manualOnly = healing.length - patchable.length
    const healed = patchable.filter((record): boolean => record.healed).length
    const firstTry = patchable.filter((record): boolean => record.attempts[0]?.passed === true).length
    const referenceVerified = healing.filter((record): boolean => record.manualOnly && record.healed).length
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
        recallByKind: { 'overflow-x': recallOf('overflow-x'), occluded: recallOf('occluded'), 'focus-escape': recallOf('focus-escape') },
        precision: mobile.defects.length === 0 ? 1 : (mobile.defects.length - falsePositives.length) / mobile.defects.length,
        negativeControlHits: negativeHits.length,
        desktopDefects: desktop.defects.length,
        cascadeMismatches,
        groupingMismatches,
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
        method: counter.method,
        model: counter.model,
        ...raw,
        inspectorContextTotal: totalContext,
        inspectorContextPerDefect: Math.round(totalContext / Math.max(mobile.defects.length, 1)),
        reductionVsLayoutDump: 1 - totalContext / raw.domLayoutStyles,
        reductionVsFullDump: 1 - totalContext / raw.domFullStyles
      },
      healing: {
        defects: healing.length,
        patchable: patchable.length,
        manualOnly,
        referenceVerified,
        healed,
        firstTry,
        successRate: healed / Math.max(patchable.length, 1),
        caughtRegressions,
        records: healing
      }
    }

    await writeFile(join(here, '../results/latest.json'), JSON.stringify(summary, undefined, 2))

    console.log('\n## 탐지 정확도 (375px)')
    console.log(`재현율 ${percent(summary.detection.recall)} · 정밀도 ${percent(summary.detection.precision)} · 대조군 오탐 ${negativeHits.length}건 · 1280px 결함 ${desktop.defects.length}건`)
    console.log(`연쇄 결함 묶음 불일치 ${cascadeMismatches}건 · URL 그룹 불일치 ${groupingMismatches}건 (결함 ${mobile.defects.length + (secondPage?.defects.length ?? 0)}건 → URL 그룹 ${groups.length}개)`)
    console.log(`종류별 재현율: 오버플로우 ${percent(summary.detection.recallByKind['overflow-x'])} · 가려짐 ${percent(summary.detection.recallByKind.occluded)} · 포커스 이탈 ${percent(summary.detection.recallByKind['focus-escape'])}`)
    console.log(`1순위 원인 진단 일치 ${percent(summary.detection.primaryHintAccuracy)} · 노드 ${mobile.stats.scannedNodes}개 탐지 ${mobile.stats.durationMs}ms`)
    console.log('\n## 소스 매핑')
    console.log(`정확한 파일:라인:컬럼 매핑 ${exactMappings}/${mobile.defects.length}`)
    console.log(`\n## 토큰 효율 (${counter.method === 'api' ? `count_tokens API, ${counter.model}` : '4자당 1토큰 근사 — 실제 토크나이저 수치와 비교 금지'})`)
    console.log(`DOM HTML ${raw.domHtml} · DOM+레이아웃 스타일 ${raw.domLayoutStyles} · DOM+전체 ComputedStyle ${raw.domFullStyles}`)
    console.log(`Inspector 컨텍스트 합계 ${totalContext} (결함당 ${summary.tokens.inspectorContextPerDefect})`)
    console.log(`절감률: 레이아웃 덤프 대비 ${percent(summary.tokens.reductionVsLayoutDump)}, 전체 덤프 대비 ${percent(summary.tokens.reductionVsFullDump)}`)
    console.log('\n## 규칙 기반 자가 치유 루프 (LLM 없음)')
    for (const record of healing) {
      const trail = record.attempts.map((attempt): string => `${attempt.hint}${attempt.passed ? '✓' : '✗'}`).join(' → ')
      const size =
        record.unit === 'ratio'
          ? `가려짐 ${Math.round(record.beforePx * 100)}%`
          : record.unit === 'count'
            ? `포커스 이탈 ${record.beforePx}방향`
            : `+${Math.round(record.beforePx)}px`
      console.log(`- ${record.file} (${size}): ${record.manualOnly ? `구조 변경 필요 → 참조 패치 ${record.healed ? '검증 통과' : '검증 실패'}` : record.healed ? '치유' : '실패'} [${trail}]`)
    }
    console.log(`성공 ${healed}/${patchable.length} (첫 시도 성공 ${firstTry}) · 구조 변경 필요 ${manualOnly}건 중 참조 패치 검증 통과 ${referenceVerified}건 · 재측정으로 잡아낸 회귀 ${caughtRegressions}건`)
    console.log('\n결과 파일: benchmarks/results/latest.json')

    // 탐지 규칙 회귀 게이트: CI 가 규칙 변경 PR 을 막을 수 있도록 불변 조건이 깨지면 종료 코드 1
    const regressions = findDetectionRegressions(summary.detection)
    if (regressions.length > 0) {
      console.error(`\n탐지 회귀 ${regressions.length}건:\n${regressions.map((problem): string => `- ${problem}`).join('\n')}`)
      process.exitCode = 1
    }
  } finally {
    await server.close()
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error: unknown): void => {
  console.error(error)
  process.exitCode = 1
})
