import { describe, expect, it } from 'vitest'
import type { Patch } from '../../shared/types/inspector'
import { findDuplicatePatch } from './patch-dedupe'

const patch = (overrides: Partial<Patch> = {}): Patch => ({
  id: 'p_1',
  defectId: 'd_1',
  file: 'src/A.vue',
  edits: [{ oldText: 'a', newText: 'b' }],
  rationale: '',
  author: 'rule',
  status: 'proposed',
  diff: '',
  originalHash: 'h1',
  createdAt: '2026-10-13T00:00:00.000Z',
  ...overrides
})
const input = { defectId: 'd_1', file: 'src/A.vue', edits: [{ oldText: 'a', newText: 'b' }] }

describe('findDuplicatePatch', () => {
  it('같은 결함·파일·편집이 대기 중이면 그 패치를 돌려준다', () => {
    expect(findDuplicatePatch([patch()], input, 'h1')?.id).toBe('p_1')
  })

  it('편집, 결함, 파일 중 하나라도 다르면 중복이 아니다', () => {
    expect(findDuplicatePatch([patch({ edits: [{ oldText: 'a', newText: 'c' }] })], input, 'h1')).toBeUndefined()
    expect(findDuplicatePatch([patch({ defectId: 'd_2' })], input, 'h1')).toBeUndefined()
    expect(findDuplicatePatch([patch({ file: 'src/B.vue' })], input, 'h1')).toBeUndefined()
  })

  it('이미 처리된 패치나 파일이 바뀐 뒤의 패치는 중복이 아니라 다시 제안할 수 있다', () => {
    expect(findDuplicatePatch([patch({ status: 'failed' }), patch({ status: 'rejected' }), patch({ status: 'verified' })], input, 'h1')).toBeUndefined()
    expect(findDuplicatePatch([patch()], input, 'changed')).toBeUndefined()
  })
})
