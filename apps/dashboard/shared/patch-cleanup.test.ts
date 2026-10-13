import { describe, expect, it } from 'vitest'
import { AUTO_PRUNE_AFTER_MS, canDelete, isDisposable, selectDisposable } from './patch-cleanup'
import type { Patch } from './types/inspector'

const patch = (overrides: Partial<Patch>): Patch => ({
  id: 'p',
  defectId: 'd_1',
  file: 'a.vue',
  edits: [],
  rationale: '',
  author: 'rule',
  status: 'proposed',
  diff: '',
  originalHash: 'h',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides
})
const now = Date.parse('2026-10-13T00:00:00.000Z')

describe('isDisposable / canDelete', () => {
  it('소스에 영향이 없는 기록만 처리 끝남으로 본다', () => {
    expect(isDisposable(patch({ status: 'rejected' }))).toBe(true)
    expect(isDisposable(patch({ status: 'rolled-back' }))).toBe(true)
    expect(isDisposable(patch({ status: 'failed', autoRolledBack: true }))).toBe(true)
  })

  it('적용된 상태(검증 통과, 자동 롤백 안 된 실패)와 대기 중 제안은 일괄 정리 대상이 아니다', () => {
    expect(isDisposable(patch({ status: 'verified' }))).toBe(false)
    expect(isDisposable(patch({ status: 'failed', autoRolledBack: false }))).toBe(false)
    expect(isDisposable(patch({ status: 'proposed' }))).toBe(false)
  })

  it('직접 삭제는 대기 중 제안까지 허용하되 적용된 패치는 막는다', () => {
    expect(canDelete(patch({ status: 'proposed' }))).toBe(true)
    expect(canDelete(patch({ status: 'verified' }))).toBe(false)
    expect(canDelete(patch({ status: 'failed' }))).toBe(false)
  })
})

describe('selectDisposable', () => {
  const old = patch({ id: 'old', status: 'rejected', rejectedAt: '2026-10-05T00:00:00.000Z' })
  const recent = patch({ id: 'recent', status: 'rolled-back', rolledBackAt: '2026-10-12T00:00:00.000Z' })
  const legacy = patch({ id: 'legacy', status: 'rejected', createdAt: '2026-09-01T00:00:00.000Z' })
  const verified = patch({ id: 'verified', status: 'verified', appliedAt: '2026-09-01T00:00:00.000Z' })

  it('기간을 주면 7일 넘은 처리 끝난 패치만 고른다 (거절 시각이 없으면 생성 시각 기준)', () => {
    const ids = selectDisposable([old, recent, legacy, verified], { now, olderThanMs: AUTO_PRUNE_AFTER_MS }).map((item): string => item.id)
    expect(ids).toEqual(['old', 'legacy'])
  })

  it('기간이 없으면 처리 끝난 패치를 전부, defectId 가 있으면 그 결함 것만 고른다', () => {
    expect(selectDisposable([old, recent, verified], { now })).toHaveLength(2)
    expect(selectDisposable([old, patch({ id: 'x', defectId: 'd_2', status: 'rejected' })], { now, defectId: 'd_2' }).map((item): string => item.id)).toEqual(['x'])
  })
})
