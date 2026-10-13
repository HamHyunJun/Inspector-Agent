import { parseScenario } from '@inspector-agent/core'
import type { Scenario } from '@inspector-agent/core'

/** 요청 본문의 시나리오를 검증한다. 없으면 undefined, 잘못됐으면 400 */
export const parseScenarioBody = (value: unknown): Scenario | undefined => {
  if (value === undefined || value === null) return undefined
  try {
    return parseScenario(value)
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: `시나리오가 올바르지 않습니다: ${error instanceof Error ? error.message : String(error)}` })
  }
}
