import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import type { Defect, DetectOptions, ScanResult, Viewport } from '@inspector-agent/core'

export interface VerifierOptions {
  /** Chromium 실행 파일 경로. 미지정 시 INSPECTOR_CHROMIUM_PATH, 그다음 Playwright 기본 설치본 */
  executablePath?: string
  detect?: DetectOptions
  /** 페이지 로드 후 레이아웃 안정화를 기다리는 시간(ms). 기본 300 */
  settleMs?: number
}

export interface DefectMeasurement {
  /** 같은 fingerprint(또는 셀렉터)의 결함이 아직 남아 있는지 */
  stillPresent: boolean
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

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
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

const scanWithBrowser = async (
  browser: Browser,
  url: string,
  viewport: Viewport,
  options: VerifierOptions
): Promise<ScanResult> => {
  const context = await browser.newContext({ viewport })
  try {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(options.settleMs ?? 300)
    await page.addScriptTag({ content: await loadDetectorSource() })
    return await page.evaluate((detectOptions): ScanResult => {
      const agent = window.__INSPECTOR_AGENT__
      if (!agent) throw new Error('Inspector-Agent 탐지기 주입에 실패했습니다.')
      return agent.detect(detectOptions)
    }, options.detect ?? {})
  } finally {
    await context.close()
  }
}

/** 하나의 URL을 여러 뷰포트에서 스캔한다 */
export const scanPage = async (
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS,
  options: VerifierOptions = {}
): Promise<ScanResult[]> => {
  const browser = await launch(options)
  try {
    const results: ScanResult[] = []
    for (const viewport of viewports) {
      results.push(await scanWithBrowser(browser, url, viewport, options))
    }
    return results
  } finally {
    await browser.close()
  }
}

const isSameDefect = (target: Defect, candidate: Defect): boolean =>
  candidate.fingerprint === target.fingerprint || candidate.node.selector === target.node.selector

/**
 * 패치 적용 후 같은 URL·뷰포트에서 다시 측정한다.
 * "LLM이 고쳤다고 주장"하는 대신 오버플로우 수치가 실제로 0이 되었는지, 새 결함이 생기지 않았는지로 판정한다.
 * baseline 은 패치 전 같은 뷰포트의 결함 목록이며, 여기에 없던 결함은 회귀로 본다.
 */
export const measureDefect = async (
  target: Defect,
  baseline: Defect[],
  options: VerifierOptions = {}
): Promise<VerificationResult> => {
  const browser = await launch(options)
  try {
    const result = await scanWithBrowser(browser, target.url, target.viewport, options)
    const remaining = result.defects.find((defect): boolean => isSameDefect(target, defect))
    const regressions = result.defects.filter(
      (defect): boolean =>
        !isSameDefect(target, defect) && !baseline.some((known): boolean => isSameDefect(known, defect))
    )
    const afterPx = remaining?.metrics.overflowPx ?? 0
    const passed = remaining === undefined && regressions.length === 0
    const verdict = passed
      ? `오버플로우 ${Math.round(target.metrics.overflowPx)}px → 0px, 새 결함 없음`
      : remaining
        ? `오버플로우가 ${Math.round(target.metrics.overflowPx)}px → ${Math.round(afterPx)}px로 남아 있습니다`
        : `대상 결함은 사라졌지만 새 결함 ${regressions.length}건이 생겼습니다`
    return {
      passed,
      verdict,
      stillPresent: remaining !== undefined,
      beforePx: target.metrics.overflowPx,
      afterPx,
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
