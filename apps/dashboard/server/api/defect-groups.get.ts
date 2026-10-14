import type { DefectGroupSummary, DefectStatus } from '../../shared/types/inspector'
import { withEngine } from '../utils/engine'

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶어 돌려준다. status 는 그룹 상태 기준 필터 */
export default defineEventHandler((event): Promise<DefectGroupSummary[]> => {
  const { status } = getQuery(event) as { status?: DefectStatus }
  return withEngine((engine) => engine.listGroups(status))
})
