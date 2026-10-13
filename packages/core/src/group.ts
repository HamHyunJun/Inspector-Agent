import { defectMagnitude } from './compress'
import type { Defect, Severity } from './types'

/**
 * 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 한 그룹으로 묶는다.
 * fingerprint(종류 | 소스 위치(또는 셀렉터) | 뷰포트 너비)에는 URL 이 들어 있지 않으므로 그대로 그룹 키가 된다.
 * 같은 컴포넌트가 여러 페이지에 쓰이면 id 는 URL 마다 달라도 고칠 곳은 한 곳이다.
 */
export interface DefectGroup<T extends Defect> {
  key: string
  /** 사람이 열어 볼 대표 결함: 가장 심각하고 가장 큰 것 (같으면 먼저 발견된 것) */
  representative: T
  members: T[]
}

const SEVERITY_RANK: Record<Severity, number> = { high: 2, medium: 1, low: 0 }

const isWorse = (a: Defect, b: Defect): boolean => {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  return bySeverity !== 0 ? bySeverity > 0 : defectMagnitude(a) > defectMagnitude(b)
}

/** 입력 순서에서 처음 등장한 그룹 순서를 유지한다 */
export const groupDefects = <T extends Defect>(defects: T[]): Array<DefectGroup<T>> => {
  const groups = new Map<string, DefectGroup<T>>()
  for (const defect of defects) {
    const group = groups.get(defect.fingerprint)
    if (!group) {
      groups.set(defect.fingerprint, { key: defect.fingerprint, representative: defect, members: [defect] })
      continue
    }
    group.members.push(defect)
    if (isWorse(defect, group.representative)) group.representative = defect
  }
  return Array.from(groups.values())
}
