import { defectMagnitude, groupDefects } from '@inspector-agent/core'
import type { Severity } from '@inspector-agent/core'
import type { DefectGroupSummary, DefectStatus, StoredDefect } from '../../shared/types/inspector'

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

export const aggregateStatus = (statuses: DefectStatus[]): DefectStatus => {
  if (statuses.includes('open')) return 'open'
  if (statuses.includes('patched')) return 'patched'
  return 'resolved'
}

/** 같은 fingerprint(종류, 소스 위치, 뷰포트)의 결함을 URL 과 무관하게 묶고, 심각도와 크기 순으로 정렬한다 */
export const summarizeGroups = (defects: StoredDefect[]): DefectGroupSummary[] =>
  groupDefects(defects)
    .map((group): DefectGroupSummary => ({
      key: group.key,
      defect: group.representative,
      status: aggregateStatus(group.members.map((member): DefectStatus => member.status)),
      members: group.members.map((member) => ({ id: member.id, url: member.url, status: member.status }))
    }))
    .sort((a, b): number => SEVERITY_ORDER[a.defect.severity] - SEVERITY_ORDER[b.defect.severity] || defectMagnitude(b.defect) - defectMagnitude(a.defect))
