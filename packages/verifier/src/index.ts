import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import type { Browser, Page } from 'playwright-core'
import { DEFAULT_MIN_COVERED_RATIO, defectMagnitude, qualifyDefectId, scenarioKey } from '@inspector-agent/core'
import { exploreStates } from './explore'
import type { ExploreOptions } from './explore'
import { scanFocusEscapes } from './focus'
import { runScenarioSteps, seedContext } from './scenario'
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

const launch = async (options: VerifierOptions): Promise<Browser> =>
  chromium.launch({
    headless: true,
    executablePath: options.executablePath ?? process.env.INSPECTOR_CHROMIUM_PATH ?? undefined
  })

const detectOnPage = async (page: Page, viewport: Viewport, detect: DetectOptions | undefined, withFocus: boolean): Promise<ScanResult> => {
  const result = await page.evaluate((detectOptions): ScanResult => {
    const agent = window.__INSPECTOR_AGENT__
    if (!agent) throw new Error('Inspector-Agent 탐지기 주입에 실패했습니다.')
    return agent.detect(detectOptions)
  }, detect ?? {})
  // 키 입력이 페이지 상태를 바꾸므로 레이아웃 탐지가 끝난 뒤에 포커스 검사를 한다
  const focusDefects = withFocus ? await scanFocusEscapes(page, result.url, viewport, detect) : []
  return { ...result, defects: [...result.defects, ...focusDefects] }
}

/** 한 뷰포트를 스캔한다. 탐색이 켜져 있으면 [기본 상태, ...열어 본 상태들] 을 돌려준다 */
const scanContext = async (browser: Browser, url: string, viewport: Viewport, options: VerifierOptions, explore: boolean): Promise<ScanResult[]> => {
  // 탐색 중 클릭이 내려받기·새 창·confirm 창으로 번지지 않게 막는다
  const context = await browser.newContext({ viewport, acceptDownloads: false })
  try {
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
    const base = await detectOnPage(page, viewport, options.detect, true)
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

/**
 * 하나의 URL을 여러 뷰포트에서 스캔한다.
 * 결과 앞쪽은 뷰포트별 기본 상태(입력 순서 그대로), 뒤쪽은 자동 탐색으로 열어 본 상태들이다
 */
export const scanPage = async (
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS,
  options: VerifierOptions = {}
): Promise<ScanResult[]> => {
  const browser = await launch(options)
  try {
    const explore = options.explore !== false && options.scenario === undefined
    // 뷰포트마다 독립된 컨텍스트라 병렬로 돌려도 서로 영향이 없다
    const perViewport = await Promise.all(viewports.map((viewport): Promise<ScanResult[]> => scanContext(browser, url, viewport, options, explore)))
    return [...perViewport.map(([base]): ScanResult => base as ScanResult), ...perViewport.flatMap((results): ScanResult[] => results.slice(1))]
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
  const browser = await launch(options)
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
