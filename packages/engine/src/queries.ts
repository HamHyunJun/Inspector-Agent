import { defectMagnitude } from '@inspector-agent/core'
import type { Severity } from '@inspector-agent/core'
import type { Env } from './env'
import { EngineError } from './errors'
import { assertDefectId, own } from './ids'
import { summarizeGroups } from './groups'
import type { DefectGroupMember, DefectGroupSummary, DefectStatus, Patch, PatchStatus, Stats, StoredDefect } from './types'

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

/** 심각도, 크기 순으로 정렬한 결함 목록(URL 별 개별 항목) */
export const listDefects = async (env: Env, status?: DefectStatus): Promise<StoredDefect[]> => {
  const { defects } = await env.store.read()
  return Object.values(defects)
    .filter((defect): boolean => !status || defect.status === status)
    .sort((a, b): number => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || defectMagnitude(b) - defectMagnitude(a))
}

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶어 돌려준다. status 는 그룹 상태 기준 필터 */
export const listGroups = async (env: Env, status?: DefectStatus): Promise<DefectGroupSummary[]> => {
  const { defects } = await env.store.read()
  return summarizeGroups(Object.values(defects)).filter((group): boolean => !status || group.status === status)
}

export const listPatches = async (env: Env, defectId?: string): Promise<Patch[]> => {
  const { patches } = await env.store.read()
  return Object.values(patches)
    .filter((patch): boolean => !defectId || patch.defectId === defectId)
    .sort((a, b): number => b.createdAt.localeCompare(a.createdAt))
}

export interface DefectDetail {
  defect: StoredDefect
  patches: Patch[]
  /** 같은 소스 위치·뷰포트라서 이 결함을 고치면 같이 사라질 다른 URL 의 결함 */
  sameLocation: DefectGroupMember[]
  scenarioName?: string
}

export const getDefectDetail = async (env: Env, id: string): Promise<DefectDetail> => {
  assertDefectId(id)
  const store = await env.store.read()
  const defect = own(store.defects, id)
  if (!defect) throw new EngineError(`결함을 찾을 수 없습니다: ${id}`, 404)
  const patches = Object.values(store.patches)
    .filter((patch): boolean => patch.defectId === id)
    .sort((a, b): number => b.createdAt.localeCompare(a.createdAt))
  const sameLocation = Object.values(store.defects)
    .filter((other): boolean => other.id !== id && other.fingerprint === defect.fingerprint)
    .map((other): DefectGroupMember => ({ id: other.id, url: other.url, status: other.status }))
  const scenarioName = defect.scenarioKey ? (own(store.scenarios, defect.scenarioKey)?.name ?? defect.scenarioKey) : undefined
  return { defect, patches, sameLocation, scenarioName }
}

export const getStats = async (env: Env): Promise<Stats> => {
  const store = await env.store.read()
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
  return { defects, patches, successRate: attempts > 0 ? passed / attempts : undefined, lastScanAt: store.lastScanAt }
}
