import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium, firefox, webkit } from 'playwright-core'
import type { Browser, Page } from 'playwright-core'
import { DEFAULT_MIN_COVERED_RATIO, defectMagnitude, qualifyDefectId, scenarioKey } from '@inspector-agent/core'
import { exploreStates } from './explore'
import type { ExploreOptions } from './explore'
import { scanFocusEscapes, scanTabStops } from './focus'
import { runScenarioSteps, seedContext } from './scenario'
import { contextOptionsFor, defectSignature, deviceViewport, needsPageEnvironment, parseVariants } from './variants'
import type { Defect, DetectOptions, Scenario, ScanResult, Viewport } from '@inspector-agent/core'

export interface VerifierOptions {
  /** Chromium 실행 파일 경로. 미지정 시 INSPECTOR_CHROMIUM_PATH, 그다음 Playwright 기본 설치본 */
  executablePath?: string
  detect?: DetectOptions
  /** 페이지 로드 후 레이아웃 안정화를 기다리는 시간(ms). 기본 300 */
  settleMs?: number
  /** 스캔 전에 시드를 심고 단계를 실행할 시나리오. 스캔과 패치 후 재측정이 같은 값을 넘기면 같은 상태에서 잰다 */
  scenario?: Scenario
  /**
   * 자동 탐색. 시나리오가 없으면 기본으로 켜져서, 페이지의 툴팁·팝오버·드롭다운·모달 트리거를 찾아 눌러/올려 본 상태까지 검사한다.
   * false 로 끄거나 시나리오를 직접 주면(시나리오가 우선) 탐색하지 않는다
   */
  explore?: boolean | ExploreOptions
  /**
   * 환경 변형 스캔(쉼표 목록 또는 배열): text-scale, long-text, dark, rtl, forced-colors, landscape, device:<이름>, engine:firefox|webkit, all.
   * 기본 상태에서 보이지 않던 결함만 따로 돌려준다. 시간이 걸려 기본은 끈다
   */
  variants?: string | string[]
}

export interface DefectMeasurement {
  /** 같은 fingerprint(또는 셀렉터)의 결함이 아직 남아 있는지 */
  stillPresent: boolean
  /** 패치 전/후 측정값. unit 이 px 이면 오버플로우 양, ratio 이면 가려진 비율(0~1), count 이면 포커스가 빠져나가는 방향 수(0~2) */
  unit: 'px' | 'ratio' | 'count'
  beforePx: number
  afterPx: number
  /** 패치 후 같은 뷰포트에 새로 생긴 결함 (회귀) */
  regressions: Defect[]
  documentOverflowPx: number
}

export interface VerificationResult extends DefectMeasurement {
  passed: boolean
  verdict: string
  measuredAt: string
}

/** 화면을 줄였을 때 깨지는 지점을 잡도록 작은 화면을 촘촘하게 둔다 (작은 휴대폰, 일반 휴대폰, 큰 휴대폰, 태블릿 세로·가로, 데스크톱) */
export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 }
]

const require = createRequire(import.meta.url)
let detectorSource: string | undefined

const loadDetectorSource = async (): Promise<string> => {
  if (detectorSource) return detectorSource
  const path = require.resolve('@inspector-agent/core/detector.global.js')
  detectorSource = await readFile(path, 'utf8')
  return detectorSource
}

/** 페이지 스크립트보다 먼저 심어 렌더 중 난 콘솔 에러·미처리 예외와 레이아웃 이동(CLS)을 모은다. 탐지기의 콘솔 에러·레이아웃 이동 규칙이 읽는다 */
const ERROR_CAPTURE_SCRIPT = `(() => {
  const errors = []
  window.__IA_ERRORS__ = errors
  const push = (message) => { if (errors.length < 20) errors.push(String(message).slice(0, 300)) }
  const original = console.error
  console.error = function (...args) {
    try { push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')) } catch { push('console.error') }
    return original.apply(this, args)
  }
  window.__IA_SHIFTS__ = []
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__IA_SHIFTS__.push({ value: entry.value, node: (entry.sources && entry.sources[0] && entry.sources[0].node) || null })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  window.addEventListener('error', (event) => push(event.message || 'error'))
  window.addEventListener('unhandledrejection', (event) => push('unhandledrejection: ' + ((event.reason && event.reason.message) || event.reason)))
})()`

const ENGINE_INSTALL_HINT = 'npx playwright-core install'

const launch = async (options: VerifierOptions, engine?: 'firefox' | 'webkit'): Promise<Browser> => {
  const type = engine === 'firefox' ? firefox : engine === 'webkit' ? webkit : chromium
  try {
    return await type.launch({
      headless: true,
      // 실행 파일 경로는 Chromium 용이다
      executablePath: engine ? undefined : (options.executablePath ?? process.env.INSPECTOR_CHROMIUM_PATH ?? undefined)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (engine && /Executable doesn't exist|browserType\.launch/i.test(message)) {
      throw new Error(`${engine} 브라우저가 설치되어 있지 않습니다. \`${ENGINE_INSTALL_HINT} ${engine}\` 로 설치한 뒤 다시 시도하세요.`)
    }
    throw error
  }
}

const detectOnPage = async (page: Page, viewport: Viewport, detect: DetectOptions | undefined, withFocus: boolean, tabProbe = false): Promise<ScanResult> => {
  const result = await page.evaluate((detectOptions): ScanResult => {
    const agent = window.__INSPECTOR_AGENT__
    if (!agent) throw new Error('Inspector-Agent 탐지기 주입에 실패했습니다.')
    return agent.detect(detectOptions)
  }, detect ?? {})
  // 키 입력이 페이지 상태를 바꾸므로 레이아웃 탐지가 끝난 뒤에 포커스 검사를 한다
  const focusDefects = withFocus ? await scanFocusEscapes(page, result.url, viewport, detect) : []
  // Tab 탐침은 문서를 한 바퀴 도는 비용이 커서 기본 상태에서만 돌린다(탐색으로 연 상태들은 제외)
  const tabDefects = tabProbe ? await scanTabStops(page, detect) : []
  return { ...result, defects: [...result.defects, ...focusDefects, ...tabDefects] }
}

/** 한 뷰포트를 스캔한다. 탐색이 켜져 있으면 [기본 상태, ...열어 본 상태들] 을 돌려준다 */
const scanContext = async (browser: Browser, url: string, viewport: Viewport, options: VerifierOptions, explore: boolean): Promise<ScanResult[]> => {
  // 탐색 중 클릭이 내려받기·새 창·confirm 창으로 번지지 않게 막는다
  const environment = options.scenario?.environment
  const context = await browser.newContext({ viewport, acceptDownloads: false, ...contextOptionsFor(environment) })
  try {
    await context.addInitScript(ERROR_CAPTURE_SCRIPT)
    const { scenario } = options
    if (scenario) await seedContext(context, url, scenario)
    const page = await context.newPage()
    context.on('page', (opened): void => void opened.close().catch((): void => undefined))
    page.on('dialog', (dialog): void => void dialog.dismiss().catch((): void => undefined))
    const settleMs = options.settleMs ?? 300
    const load = async (): Promise<void> => {
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(settleMs)
    }
    await load()
    if (scenario?.steps?.length) {
      await runScenarioSteps(page, scenario.steps)
      // 클릭 직후의 전환(transition)이 끝난 뒤에 잰다
      await page.waitForTimeout(settleMs)
    }
    await page.addScriptTag({ content: await loadDetectorSource() })
    if (needsPageEnvironment(environment)) {
      await page.evaluate((env): void => window.__INSPECTOR_AGENT__?.applyEnvironment(env), environment!)
      // 글자·방향이 바뀐 뒤의 재배치가 끝나길 기다린다
      await page.waitForTimeout(options.settleMs ?? 300)
    }
    const base = await detectOnPage(page, viewport, options.detect, true, true)
    if (scenario) {
      // 같은 URL 이라도 시나리오가 다르면 다른 결함이다: id 에 시나리오 키를 섞고 결함마다 키를 남긴다
      const key = scenarioKey(scenario)
      return [{ ...base, scenarioKey: key, defects: base.defects.map((defect): Defect => ({ ...defect, id: qualifyDefectId(defect.id, key), scenarioKey: key })) }]
    }
    if (!explore) return [base]

    // 기본 상태 스캔(키 입력 포함)이 끝났으니 처음 상태로 되돌린 뒤 탐색한다. 탐색 중 데이터를 바꾸는 요청은 보내지 않는다
    await load()
    await page.addScriptTag({ content: await loadDetectorSource() })
    await page.route('**/*', (route): Promise<void> => (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort()))
    const states = await exploreStates(page, {
      url,
      options: typeof options.explore === 'object' ? options.explore : undefined,
      baseFingerprints: new Set(base.defects.map((defect): string => defect.fingerprint)),
      detectState: async (withFocus): Promise<{ defects: Defect[]; documentOverflowPx: number }> => detectOnPage(page, viewport, options.detect, withFocus),
      reload: async (): Promise<void> => {
        await load()
        await page.addScriptTag({ content: await loadDetectorSource() })
      }
    })
    const explored = states.map((state): ScanResult => {
      const key = scenarioKey(state.scenario)
      return {
        scenarioKey: key,
        scenario: state.scenario,
        url: base.url,
        viewport,
        documentOverflowPx: state.documentOverflowPx,
        defects: state.defects.map((defect): Defect => ({ ...defect, id: qualifyDefectId(defect.id, key), scenarioKey: key })),
        stats: { scannedNodes: base.stats.scannedNodes, durationMs: state.durationMs }
      }
    })
    return [base, ...explored]
  } finally {
    await context.close()
  }
}

const scanWithBrowser = async (browser: Browser, url: string, viewport: Viewport, options: VerifierOptions): Promise<ScanResult> => {
  const [result] = await scanContext(browser, url, viewport, options, false)
  if (!result) throw new Error('스캔 결과가 비어 있습니다.')
  return result
}

/** 사용자가 준 시나리오(시드·단계) 위에 변형의 환경을 얹는다 */
const layerVariant = (base: Scenario | undefined, variant: Scenario): Scenario => ({
  ...base,
  ...variant,
  name: [base?.name, variant.name].filter((name): boolean => name !== undefined).join(' · '),
  environment: { ...base?.environment, ...variant.environment }
})

/**
 * 변형 하나를 스캔한다. 기본 상태에서 이미 나오던 결함(뷰포트 너비를 뺀 서명이 같은 것)은 빼고 "그 환경에서만 생기는 결함"만 남긴다.
 * 결과가 비어 있어도 돌려준다: 저장소가 같은 환경에서 사라진 결함을 해소로 바꾸려면 빈 결과가 필요하다.
 */
const scanVariant = async (
  mainBrowser: Browser,
  url: string,
  viewports: Viewport[],
  baseline: ScanResult[],
  variant: ReturnType<typeof parseVariants>[number],
  options: VerifierOptions
): Promise<ScanResult[]> => {
  if (variant.landscape) {
    // 가로 모드: 주어진 뷰포트의 가로·세로를 맞바꿔 일반 스캔한다(높이가 작아져 100vh, 고정 요소, 큰 모달이 달라진다)
    const swapped = viewports.map((viewport): Viewport => ({ width: viewport.height, height: viewport.width }))
    const results = await Promise.all(swapped.map((viewport): Promise<ScanResult[]> => scanContext(mainBrowser, url, viewport, options, false)))
    return results.map(([result]): ScanResult => result as ScanResult)
  }
  const scenario = layerVariant(options.scenario, variant.scenario!)
  const engine = scenario.environment?.engine
  const browser = engine ? await launch(options, engine) : mainBrowser
  try {
    // 장치는 화면 크기가 장치마다 정해져 있어 주어진 뷰포트를 쓰지 않고 한 번만 돈다
    const targets = scenario.environment?.device ? [deviceViewport(scenario.environment.device)] : viewports
    const known = new Set(baseline.flatMap((result): string[] => result.defects.map((defect): string => defectSignature(defect.fingerprint))))
    const sameViewport = (viewport: Viewport): Set<string> =>
      new Set(baseline.filter((result): boolean => result.viewport.width === viewport.width).flatMap((result): string[] => result.defects.map((defect): string => defectSignature(defect.fingerprint))))
    const results = await Promise.all(targets.map((viewport): Promise<ScanResult[]> => scanContext(browser, url, viewport, { ...options, scenario }, false)))
    return results.map(([result], index): ScanResult => {
      const scanned = result as ScanResult
      const already = scenario.environment?.device || engine ? known : sameViewport(targets[index] as Viewport)
      // 저장소가 이 결과를 같은 환경으로 재측정할 수 있도록 시나리오를 함께 싣는다
      return { ...scanned, scenario, defects: scanned.defects.filter((defect): boolean => !already.has(defectSignature(defect.fingerprint))) }
    })
  } finally {
    if (engine) await browser.close()
  }
}

/**
 * 하나의 URL을 여러 뷰포트에서 스캔한다.
 * 결과 앞쪽은 뷰포트별 기본 상태(입력 순서 그대로), 그 뒤는 자동 탐색으로 열어 본 상태들, 마지막은 환경 변형(variants) 스캔 결과다
 */
export const scanPage = async (
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS,
  options: VerifierOptions = {}
): Promise<ScanResult[]> => {
  // 스캔(수 초) 전에 잘못된 변형 이름을 먼저 알린다
  const variants = parseVariants(options.variants)
  const browser = await launch(options, options.scenario?.environment?.engine)
  try {
    const explore = options.explore !== false && options.scenario === undefined
    // 뷰포트마다 독립된 컨텍스트라 병렬로 돌려도 서로 영향이 없다
    const perViewport = await Promise.all(viewports.map((viewport): Promise<ScanResult[]> => scanContext(browser, url, viewport, options, explore)))
    const bases = perViewport.map(([base]): ScanResult => base as ScanResult)
    const variantResults: ScanResult[] = []
    for (const variant of variants) variantResults.push(...(await scanVariant(browser, url, viewports, bases, variant, options)))
    return [...bases, ...perViewport.flatMap((results): ScanResult[] => results.slice(1)), ...variantResults]
  } finally {
    await browser.close()
  }
}

const isSameDefect = (target: Defect, candidate: Defect): boolean =>
  candidate.fingerprint === target.fingerprint || candidate.node.selector === target.node.selector

const MEASURE_UNIT: Record<Defect['kind'], VerificationResult['unit']> = { 'overflow-x': 'px', 'overflow-y': 'px', 'clipped-text': 'px', occluded: 'ratio', 'focus-escape': 'count' }
const SUBJECT: Record<Defect['kind'], string> = { 'overflow-x': '오버플로우', 'overflow-y': '세로 오버플로우', 'clipped-text': '텍스트 잘림', occluded: '가려짐', 'focus-escape': '포커스 이탈' }

const describeMagnitude = (defect: Defect, value: number): string => {
  const unit = MEASURE_UNIT[defect.kind]
  return unit === 'ratio' ? `${Math.round(value * 100)}%` : unit === 'count' ? `${value}방향` : `${Math.round(value)}px`
}

/**
 * 패치 적용 후 같은 URL·뷰포트에서 다시 측정한다.
 * "LLM이 고쳤다고 주장"하는 대신 수치가 실제로 0이 되었는지, 새 결함이 생기지 않았는지로 판정한다.
 * - overflow-x: 오버플로우 px 가 0
 * - occluded: 가려진 비율이 0. 일부만 풀린 경우(클릭이 여전히 막힘)는 실패이므로 탐지 임계값을 낮춰 잔여 가려짐까지 본다
 * baseline 은 패치 전 같은 뷰포트의 결함 목록이며, 여기에 없던 결함은 회귀로 본다.
 */
export const measureDefect = async (
  target: Defect,
  baseline: Defect[],
  options: VerifierOptions = {}
): Promise<VerificationResult> => {
  // 다른 엔진에서 찾은 결함은 그 엔진으로 다시 재야 같은 화면을 잰다
  const browser = await launch(options, options.scenario?.environment?.engine)
  try {
    const detect = target.kind === 'occluded' ? { ...options.detect, minCoveredRatio: 0.01 } : options.detect
    const result = await scanWithBrowser(browser, target.url, target.viewport, { ...options, detect })
    const remaining = result.defects.find((defect): boolean => isSameDefect(target, defect))
    // 낮춘 임계값으로 잡힌 약한 가려짐은 대상 잔여 확인에만 쓰고, 회귀는 기본 임계값 기준으로만 센다
    const regressions = result.defects.filter(
      (defect): boolean =>
        !isSameDefect(target, defect) &&
        !baseline.some((known): boolean => isSameDefect(known, defect)) &&
        (defect.kind !== 'occluded' || defect.metrics.coveredRatio >= DEFAULT_MIN_COVERED_RATIO)
    )
    const before = defectMagnitude(target)
    const after = remaining ? defectMagnitude(remaining) : 0
    const passed = remaining === undefined && regressions.length === 0
    const subject = SUBJECT[target.kind]
    const verdict = passed
      ? `${subject} ${describeMagnitude(target, before)} → ${describeMagnitude(target, 0)}, 새 결함 없음`
      : remaining
        ? `${subject} ${describeMagnitude(target, before)} → ${describeMagnitude(target, after)}로 남아 있습니다`
        : `대상 결함은 사라졌지만 새 결함 ${regressions.length}건이 생겼습니다`
    return {
      passed,
      verdict,
      stillPresent: remaining !== undefined,
      unit: MEASURE_UNIT[target.kind],
      beforePx: before,
      afterPx: after,
      regressions,
      documentOverflowPx: result.documentOverflowPx,
      measuredAt: new Date().toISOString()
    }
  } finally {
    await browser.close()
  }
}

export const parseViewports = (value: string): Viewport[] =>
  value
    .split(',')
    .map((part): string => part.trim())
    .filter((part): boolean => part !== '')
    .map((part): Viewport => {
      const [width = '0', height] = part.split('x')
      return { width: Number(width), height: height ? Number(height) : 900 }
    })
