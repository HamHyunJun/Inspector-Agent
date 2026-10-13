import type { DefectGroupSummary, DefectStatus } from '../../shared/types/inspector'
import { summarizeGroups } from '../utils/defect-groups'
import { readStore } from '../utils/store'

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶어 돌려준다. status 는 그룹 상태 기준 필터 */
export default defineEventHandler(async (event): Promise<DefectGroupSummary[]> => {
  const { status } = getQuery(event) as { status?: DefectStatus }
  const { defects } = await readStore()
  return summarizeGroups(Object.values(defects)).filter((group): boolean => !status || group.status === status)
})
