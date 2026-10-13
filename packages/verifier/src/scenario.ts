import { toStorageString } from '@inspector-agent/core'
import type { Scenario, ScenarioStep } from '@inspector-agent/core'
import type { BrowserContext, Page } from 'playwright-core'

/**
 * 시나리오 실행. 시드는 페이지가 뜨기 전에 컨텍스트에 심고(앱 코드가 읽기 전에 값이 있어야 한다),
 * 단계는 페이지를 연 뒤 탐지 전에 순서대로 실행한다. 스캔과 패치 후 재측정이 같은 scanWithBrowser 를 쓰므로 둘 다 재사용한다.
 */

/** 단계 하나가 이 시간 안에 끝나지 않으면 실패로 본다. 셀렉터 오타로 스캔이 오래 멈추는 것을 막는다 */
const STEP_TIMEOUT_MS = 5000

export const seedContext = async (context: BrowserContext, url: string, scenario: Scenario): Promise<void> => {
  const seed = scenario.seed
  if (!seed) return

  if (seed.cookies?.length) {
    // 쿠키는 스캔하는 URL 의 호스트에만 설정한다 (시나리오가 다른 도메인에 쿠키를 심지 못하게)
    const { hostname } = new URL(url)
    await context.addCookies(
      seed.cookies.map((cookie) => (cookie.path ? { name: cookie.name, value: cookie.value, domain: hostname, path: cookie.path } : { name: cookie.name, value: cookie.value, url }))
    )
  }

  const toStrings = (values: Record<string, unknown> | undefined): Record<string, string> =>
    Object.fromEntries(Object.entries(values ?? {}).map(([key, value]): [string, string] => [key, toStorageString(value)]))
  const local = toStrings(seed.localStorage)
  const session = toStrings(seed.sessionStorage)
  if (Object.keys(local).length === 0 && Object.keys(session).length === 0) return

  // 매 로드마다 시드 값으로 덮어써서 앱이 저장한 이전 상태가 결과를 흔들지 못하게 한다
  await context.addInitScript(
    ({ local: localValues, session: sessionValues }): void => {
      const write = (storage: Storage, values: Record<string, string>): void => {
        for (const [key, value] of Object.entries(values)) storage.setItem(key, value)
      }
      try {
        write(window.localStorage, localValues)
        write(window.sessionStorage, sessionValues)
      } catch {
        // about:blank 등 저장소에 접근할 수 없는 문서에서는 건너뛴다
      }
    },
    { local, session }
  )
}

const describeStep = (step: ScenarioStep): string => {
  if (step.action === 'wait') return step.selector !== undefined ? `wait ${step.selector}` : `wait ${step.ms}ms`
  return `${step.action} ${step.selector}`
}

export const runScenarioSteps = async (page: Page, steps: ScenarioStep[]): Promise<void> => {
  for (const [index, step] of steps.entries()) {
    try {
      if (step.action === 'click') await page.click(step.selector, { timeout: STEP_TIMEOUT_MS })
      else if (step.action === 'fill') await page.fill(step.selector, step.value, { timeout: STEP_TIMEOUT_MS })
      else if (step.selector !== undefined) await page.waitForSelector(step.selector, { state: 'visible', timeout: STEP_TIMEOUT_MS })
      else await page.waitForTimeout(step.ms ?? 0)
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0]
      throw new Error(`시나리오 steps[${index}] (${describeStep(step)}) 실패: ${reason}`)
    }
  }
}
