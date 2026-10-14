import type { Env } from './env'
import { summarizeGroups } from './groups'
import type { DefectGroupSummary, DefectStatus } from './types'

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶어 심각도·크기 순으로 돌려준다. status 는 그룹 상태 기준 필터 */
export const listGroups = async (env: Env, status?: DefectStatus): Promise<DefectGroupSummary[]> => {
  const { defects } = await env.store.read()
  return summarizeGroups(Object.values(defects)).filter((group): boolean => !status || group.status === status)
}
