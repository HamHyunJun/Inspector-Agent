import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEdits, defectMagnitude, groupDefects, toAgentPayload } from '@inspector-agent/core'
import type { Defect, DefectKind, PatchEdit } from '@inspector-agent/core'
import { buildDeclarationPatch, formatRulesCompact, locateSourceRules, readSnippet } from '@inspector-agent/source-locator'
import { measureDefect, scanPage } from '@inspector-agent/verifier'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import {
  DESKTOP_VIEWPORT,
  EXPECTED_AT_MOBILE,
  matchesExpected,
  VARIANT_EXPECTED,
  MOBILE_VIEWPORT,
  NEGATIVE_CONTROLS,
  PLAYGROUND_SCENARIO,
  REACT_EXPECTED_AT_MOBILE,
  REACT_NEGATIVE_CONTROLS,
  SCENARIO_ONLY,
  SECOND_PAGE_QUERY
} from './fixtures'
import type { ExpectedDefect } from './fixtures'
import { findDetectionRegressions } from './gate'
import { preparePlayground } from './prepare'
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
  /** 규칙 기반 패치가 처음 수정을 시도한 파일 (React 는 JSX 가 아니라 스타일시트). 치유 성공 여부와는 별개다 */
  patchedFile?: string
  /** 진단 제안이 전부 조상/구조 변경이 필요해 규칙 기반 자동 패치 대상이 아닌 경우 */
  manualOnly: boolean
  beforePx: number
  healed: boolean
  attempts: HealingAttempt[]
}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const playgroundRoot = join(repoRoot, 'apps/playground')
const reactPlaygroundRoot = join(repoRoot, 'apps/playground-react')
const executablePath = process.env.INSPECTOR_CHROMIUM_PATH || undefined
const PORT = 5199
const REACT_PORT = 5198

const LAYOUT_PROPERTIES = [
  'display', 'position', 'box-sizing', 'width', 'min-width', 'max-width', 'flex-direction', 'flex-wrap',
  'flex-grow', 'flex-shrink', 'flex-basis', 'grid-template-columns', 'column-gap', 'white-space',
  'word-break', 'overflow-wrap', 'overflow-x', 'text-overflow', 'padding-left', 'padding-right',
  'margin-left', 'margin-right'
]

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

const startServer = async (root: string, port: number): Promise<ViteDevServer> => {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { port, strictPort: true } })
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

/** 엔진의 get_defect_context 와 같은 방식으로 에이전트용 컨텍스트를 만들고 토큰 수를 센다 */
const buildContextTokens = async (root: string, defect: Defect, counter: TokenCounter): Promise<number> => {
  const payload = toAgentPayload(defect)
  const file = defect.node.source?.file
  if (!file) return counter.count(JSON.stringify(payload))
  const content = await readFile(join(root, file), 'utf8')
  const read = (path: string): Promise<string> => readFile(join(root, path), 'utf8')
  const rules = [
    ...(await locateSourceRules(file, content, defect.node.classes, read)),
    ...(await locateSourceRules(file, content, defect.parent.classes, read)),
    ...(await locateSourceRules(file, content, defect.node.childClasses, read))
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
  const read = (relativePath: string): Promise<string> => readFile(join(root, relativePath), 'utf8')
  for (const suggestion of autoPatchable) {
    const isNode = suggestion.target === 'node'
    const snapshot = isNode ? defect.node : defect.parent
    const rules = await locateSourceRules(file, original, snapshot.classes, read)
    // 규칙이 별도 스타일시트(React)에 있으면 그 파일이 패치 대상이다
    const targetFile = rules[0]?.file ?? file
    const targetPath = join(root, targetFile)
    const targetOriginal = await readFile(targetPath, 'utf8')
    const patch = buildDeclarationPatch(targetOriginal, rules.filter((rule): boolean => rule.file === targetFile), snapshot.classes, suggestion.declarations)
    if (!patch.ok) {
      record.attempts.push({ hint: suggestion.hint, passed: false, verdict: patch.error, afterPx: defectMagnitude(defect), regressions: 0 })
      continue
    }
    const applied = applyEdits(targetOriginal, patch.edits)
    if (!applied.ok) continue
    record.patchedFile ??= targetFile
    await writeFile(targetPath, applied.content, 'utf8')
    await new Promise((done): void => {
      setTimeout(done, 500)
    })
    const result = await measureDefect(defect, baseline, { executablePath, explore: false })
    record.attempts.push({
      hint: suggestion.hint,
      passed: result.passed,
      verdict: result.verdict,
      afterPx: result.afterPx,
      regressions: result.regressions.length
    })
    // 다음 결함 측정에 영향을 주지 않도록 성공·실패와 무관하게 원본으로 되돌린다
    await writeFile(targetPath, targetOriginal, 'utf8')
    if (result.passed) {
      record.healed = true
      break
    }
  }

  // 규칙 기반 패치가 불가능한 결함은 참조 패치(사람이 고치는 방식)가 검증 루프를 통과하는지만 확인한다
  if (autoPatchable.length === 0 && referenceEdits.length > 0) {
    const applied = applyEdits(original, referenceEdits)
    if (applied.ok) {
      await writeFile(path, applied.content, 'utf8')
      await new Promise((done): void => {
        setTimeout(done, 500)
      })
      const result = await measureDefect(defect, baseline, { executablePath, explore: false })
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

interface ReactSummary {
  expected: number
  detected: number
  recall: number
  precision: number
  negativeControlHits: number
  desktopDefects: number
  primaryHintAccuracy: number
  sourceMapping: { exact: number; total: number }
  /** 규칙 기반 패치가 정답 스타일시트를 수정 대상으로 잡지 못한 결함 수 (치유 성공 여부와는 별개) */
  styleLocationMismatches: number
  healing: HealingRecord[]
}

/**
 * React(Vite) 대상: JSX 소스 매핑(data-ia-src)과 CSS Modules/.css/.scss 규칙 탐색이 되는지 검증한다.
 * 정답표(REACT_EXPECTED_AT_MOBILE)의 styleFile 은 규칙 기반 패치가 수정해야 하는 스타일시트다.
 */
const benchReact = async (): Promise<ReactSummary> => {
  const workdir = await preparePlayground(reactPlaygroundRoot)
  const server = await startServer(workdir, REACT_PORT)
  try {
    const url = `http://localhost:${REACT_PORT}/`
    const [mobile, desktop] = await scanPage(url, [MOBILE_VIEWPORT, DESKTOP_VIEWPORT], { executablePath, explore: false })
    if (!mobile || !desktop) throw new Error('React 스캔 결과가 비어 있습니다.')
    if (mobile.stats.scannedNodes < 10) throw new Error('playground-react 가 렌더링되지 않았습니다. 개발 서버 로그를 확인하세요.')
    const isExpected = (defect: Defect, expected: ExpectedDefect): boolean => defect.node.source?.file === expected.file && defect.kind === expected.kind
    const truePositives = REACT_EXPECTED_AT_MOBILE.filter((expected): boolean => mobile.defects.some((defect): boolean => isExpected(defect, expected)))
    const falsePositives = mobile.defects.filter((defect): boolean => !REACT_EXPECTED_AT_MOBILE.some((expected): boolean => isExpected(defect, expected)))
    const hintMatches = REACT_EXPECTED_AT_MOBILE.filter((expected): boolean =>
      mobile.defects.some((defect): boolean => isExpected(defect, expected) && defect.suggestions[0]?.hint === expected.primaryHint)
    )
    let exact = 0
    for (const defect of mobile.defects) {
      const source = defect.node.source
      if (!source?.exact) continue
      const line = (await readFile(join(workdir, source.file), 'utf8')).split('\n')[source.line - 1] ?? ''
      if (line.slice(source.column - 1).startsWith(`<${defect.node.tag}`)) exact++
    }
    const healing: HealingRecord[] = []
    for (const defect of mobile.defects) healing.push(await healDefect(workdir, defect, mobile.defects))
    const styleLocationMismatches = REACT_EXPECTED_AT_MOBILE.filter((expected): boolean => {
      const record = healing.find((item): boolean => item.file === expected.file)
      return record?.patchedFile !== expected.styleFile
    }).length
    return {
      expected: REACT_EXPECTED_AT_MOBILE.length,
      detected: mobile.defects.length,
      recall: truePositives.length / REACT_EXPECTED_AT_MOBILE.length,
      precision: mobile.defects.length === 0 ? 1 : (mobile.defects.length - falsePositives.length) / mobile.defects.length,
      negativeControlHits: mobile.defects.filter((defect): boolean => REACT_NEGATIVE_CONTROLS.includes(defect.node.source?.file ?? '')).length,
      desktopDefects: desktop.defects.length,
      primaryHintAccuracy: hintMatches.length / REACT_EXPECTED_AT_MOBILE.length,
      sourceMapping: { exact, total: mobile.defects.length },
      styleLocationMismatches,
      healing
    }
  } finally {
    await server.close()
    await rm(workdir, { recursive: true, force: true })
  }
}

const main = async (): Promise<void> => {
  // 브라우저와 서버를 띄우기 전에 토큰 계측 자격 증명부터 확인한다
  const counter = await createTokenCounter()
  const workdir = await preparePlayground(playgroundRoot)
  const server = await startServer(workdir, PORT)
  const url = `http://localhost:${PORT}/`
  console.log(`playground 복사본: ${workdir}`)

  try {
    // 1) 탐지 정확도
    const [mobile, desktop] = await scanPage(url, [MOBILE_VIEWPORT, DESKTOP_VIEWPORT], { executablePath, explore: false })
    if (!mobile || !desktop) throw new Error('스캔 결과가 비어 있습니다.')
    if (mobile.stats.scannedNodes < 10) throw new Error('playground 가 렌더링되지 않았습니다. 개발 서버 로그를 확인하세요.')
    const isExpected = matchesExpected
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
    const [secondPage] = await scanPage(`${url}${SECOND_PAGE_QUERY}`, [MOBILE_VIEWPORT], { executablePath, explore: false })
    const groups = groupDefects([...mobile.defects, ...(secondPage?.defects ?? [])])
    const groupingMismatches = EXPECTED_AT_MOBILE.filter((expected): boolean => {
      if (!expected.alsoOnSecondPage) return false
      const group = groups.find((item): boolean => isExpected(item.representative, expected))
      return new Set(group?.members.map((member): string => member.url)).size !== 2
    }).length
    // 시나리오 전용 결함: 시나리오(메뉴 열기 + 시드)로만 보이고, 같은 URL 의 일반 스캔에는 없어야 한다
    const [scenarioScan] = await scanPage(url, [MOBILE_VIEWPORT], { executablePath, scenario: PLAYGROUND_SCENARIO })
    const scenarioMismatches = SCENARIO_ONLY.filter((expected): boolean => {
      const withScenario = scenarioScan?.defects.find((defect): boolean => isExpected(defect, expected))
      const visibleWithoutScenario = mobile.defects.some((defect): boolean => (expected.selector !== undefined ? isExpected(defect, expected) : defect.node.source?.file === expected.file))
      return !withScenario || visibleWithoutScenario || withScenario.suggestions[0]?.hint !== expected.primaryHint
    }).length
    // 패치 후 재측정이 스캔 때와 같은 시나리오를 쓰는지: 고치기 전에는 (시나리오로 재면) 남아 있고, 고친 뒤에는 통과해야 한다.
    // 시나리오 없이 재면 메뉴가 닫힌 화면을 재서 고치기 전에도 통과해 버리는데, 이것이 시나리오를 재측정에 넘기는 이유다
    const remeasured = SCENARIO_ONLY.find((expected): boolean => expected.referenceEdits !== undefined)
    const remeasureTarget = remeasured ? scenarioScan?.defects.find((defect): boolean => isExpected(defect, remeasured)) : undefined
    let scenarioRemeasureMismatches = 0
    let falsePassWithoutScenario = false
    if (remeasured?.referenceEdits && remeasureTarget && scenarioScan) {
      const unfixed = await measureDefect(remeasureTarget, scenarioScan.defects, { executablePath, scenario: PLAYGROUND_SCENARIO })
      const unfixedWithoutScenario = await measureDefect(remeasureTarget, scenarioScan.defects, { executablePath, explore: false })
      falsePassWithoutScenario = unfixedWithoutScenario.passed
      const path = join(workdir, remeasured.file)
      const original = await readFile(path, 'utf8')
      const fixed = applyEdits(original, remeasured.referenceEdits)
      let afterFix = false
      if (fixed.ok) {
        try {
          await writeFile(path, fixed.content, 'utf8')
          await new Promise((done): void => {
            setTimeout(done, 500)
          })
          afterFix = (await measureDefect(remeasureTarget, scenarioScan.defects, { executablePath, scenario: PLAYGROUND_SCENARIO })).passed
        } finally {
          await writeFile(path, original, 'utf8')
        }
      }
      scenarioRemeasureMismatches = Number(unfixed.passed || !unfixed.stillPresent) + Number(!afterFix)
    } else {
      scenarioRemeasureMismatches = 1
    }
    // 환경 변형: 그 환경(글자 확대, 긴 문구, 다크 모드, RTL, 고대비, 실기기)에서만 정답이 탐지되고 기본 스캔에는 없어야 한다
    const variantNames = Array.from(new Set(VARIANT_EXPECTED.map((item): string => item.variant)))
    const variantScans = (await scanPage(url, [MOBILE_VIEWPORT], { executablePath, explore: false, variants: variantNames })).slice(1)
    const variantMismatches = VARIANT_EXPECTED.filter(({ expected }): boolean => {
      const foundInVariant = variantScans.some((result): boolean => result.defects.some((defect): boolean => isExpected(defect, expected)))
      const visibleInBase = mobile.defects.some((defect): boolean => isExpected(defect, expected))
      return !foundInVariant || visibleInBase
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

    const react = await benchReact()

    const summary = {
      measuredAt: new Date().toISOString(),
      detection: {
        expected: EXPECTED_AT_MOBILE.length,
        detected: mobile.defects.length,
        recall: truePositives.length / EXPECTED_AT_MOBILE.length,
        recallByKind: {
          'overflow-x': recallOf('overflow-x'),
          'overflow-y': recallOf('overflow-y'),
          'clipped-text': recallOf('clipped-text'),
          occluded: recallOf('occluded'),
          'focus-escape': recallOf('focus-escape')
        },
        precision: mobile.defects.length === 0 ? 1 : (mobile.defects.length - falsePositives.length) / mobile.defects.length,
        negativeControlHits: negativeHits.length,
        desktopDefects: desktop.defects.length,
        cascadeMismatches,
        groupingMismatches,
        scenarioMismatches,
        scenarioRemeasureMismatches,
        variantMismatches,
        falsePassWithoutScenario,
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
      react,
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
    console.log(`시나리오 전용 결함 불일치 ${scenarioMismatches}건 · 재측정 시나리오 반영 불일치 ${scenarioRemeasureMismatches}건 (시나리오 없이 재면 고치기 전에도 통과: ${falsePassWithoutScenario ? '예' : '아니오'})`)
    console.log(`환경 변형 정답 불일치 ${variantMismatches}건 (정답 ${VARIANT_EXPECTED.length}건: ${variantNames.join(', ')})`)
    const byKind = summary.detection.recallByKind
    console.log(`종류별 재현율: 가로 오버플로우 ${percent(byKind['overflow-x'])} · 세로 오버플로우 ${percent(byKind['overflow-y'])} · 텍스트 잘림 ${percent(byKind['clipped-text'])} · 가려짐 ${percent(byKind.occluded)} · 포커스 이탈 ${percent(byKind['focus-escape'])}`)
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
    console.log('\n## React(Vite) 대상 (apps/playground-react)')
    console.log(`재현율 ${percent(react.recall)} · 정밀도 ${percent(react.precision)} · 대조군 오탐 ${react.negativeControlHits}건 · 1280px 결함 ${react.desktopDefects}건 · 1순위 원인 진단 일치 ${percent(react.primaryHintAccuracy)}`)
    console.log(`JSX 소스 매핑 ${react.sourceMapping.exact}/${react.sourceMapping.total} · 정답 스타일시트를 수정 대상으로 찾음 ${react.healing.length - react.styleLocationMismatches}/${react.healing.length} · 치유 ${react.healing.filter((record): boolean => record.healed).length}/${react.healing.length}`)
    for (const record of react.healing) console.log(`- ${record.file} → ${record.patchedFile ?? '수정 대상 없음'} (${record.healed ? '치유' : '규칙 기반 단독 치유 실패 — Vue ProductCard 와 같은 복합 원인'})`)
    console.log('\n결과 파일: benchmarks/results/latest.json')

    // 탐지 규칙 회귀 게이트: CI 가 규칙 변경 PR 을 막을 수 있도록 불변 조건이 깨지면 종료 코드 1
    const regressions = [
      ...findDetectionRegressions(summary.detection),
      ...findDetectionRegressions({
        ...react,
        cascadeMismatches: 0,
        groupingMismatches: 0,
        scenarioMismatches: 0,
        scenarioRemeasureMismatches: 0
      }).map((problem): string => `[React] ${problem}`),
      ...(react.sourceMapping.exact < react.sourceMapping.total ? [`[React] JSX 소스 매핑이 정확하지 않은 결함 ${react.sourceMapping.total - react.sourceMapping.exact}건`] : [])
    ]
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
