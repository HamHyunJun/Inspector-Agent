import type { DashboardStats, DefectStatus, PatchStatus } from '../../shared/types/inspector'
import { summarizeGroups } from '../utils/defect-groups'
import { readStore } from '../utils/store'

export default defineEventHandler(async (): Promise<DashboardStats> => {
  const store = await readStore()
  const defects: Record<DefectStatus, number> = { open: 0, patched: 0, resolved: 0 }
  const patches: Record<PatchStatus, number> = { proposed: 0, verified: 0, failed: 0, 'rolled-back': 0, rejected: 0 }
  // 결함 수는 목록(URL 그룹)과 같은 기준으로 센다
  for (const group of summarizeGroups(Object.values(store.defects))) defects[group.status]++
  // 롤백된 패치도 검증을 통과했던 시도이므로 성공률 계산에는 검증 결과 기준으로 포함한다
  let attempts = 0
  let passed = 0
  for (const patch of Object.values(store.patches)) {
    patches[patch.status]++
    if (patch.verification) {
      attempts++
      if (patch.verification.passed) passed++
    }
  }
  return {
    defects,
    patches,
    successRate: attempts > 0 ? passed / attempts : undefined,
    lastScanAt: store.lastScanAt
  }
})
