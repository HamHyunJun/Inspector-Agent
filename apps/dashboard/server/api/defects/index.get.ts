import { defectMagnitude } from '@inspector-agent/core'
import type { Severity } from '@inspector-agent/core'
import type { DefectStatus, StoredDefect } from '../../../shared/types/inspector'
import { readStore } from '../../utils/store'

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

export default defineEventHandler(async (event): Promise<StoredDefect[]> => {
  const { status } = getQuery(event) as { status?: DefectStatus }
  const { defects } = await readStore()
  return Object.values(defects)
    .filter((defect): boolean => !status || defect.status === status)
    .sort(
      (a, b): number =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || defectMagnitude(b) - defectMagnitude(a)
    )
})
