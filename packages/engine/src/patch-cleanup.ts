import type { Patch } from './types'

/** 처리가 끝난 패치를 자동 삭제하기까지의 기간 */
export const AUTO_PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 소스 파일에 더는 영향이 없고 기록만 남은 패치: 거절, 롤백됨, 검증 실패 후 자동 롤백된 패치.
 * 적용된 상태(verified, 자동 롤백되지 않은 failed)는 롤백 기준이 되는 백업이 필요하므로 포함하지 않는다.
 */
export const isDisposable = (patch: Patch): boolean =>
  patch.status === 'rejected' || patch.status === 'rolled-back' || (patch.status === 'failed' && patch.autoRolledBack === true)

/** 사용자가 직접 삭제할 수 있는 패치: 처리가 끝난 것과, 아직 적용 전인 제안 */
export const canDelete = (patch: Patch): boolean => isDisposable(patch) || patch.status === 'proposed'

/** 처리가 끝난 시각(ms). 거절/롤백 시각이 없으면 적용·생성 시각으로 대신한다 */
export const finishedAt = (patch: Patch): number =>
  Date.parse(patch.rolledBackAt ?? patch.rejectedAt ?? patch.appliedAt ?? patch.createdAt)

/** 일괄 정리 대상. olderThanMs 를 주면 그 기간보다 오래된 것만 고른다 (자동 삭제용) */
export const selectDisposable = (patches: Patch[], options: { now?: number; olderThanMs?: number; defectId?: string } = {}): Patch[] => {
  const now = options.now ?? Date.now()
  return patches.filter(
    (patch): boolean =>
      isDisposable(patch) &&
      (options.defectId === undefined || patch.defectId === options.defectId) &&
      (options.olderThanMs === undefined || now - finishedAt(patch) >= options.olderThanMs)
  )
}
