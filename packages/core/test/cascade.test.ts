import { describe, expect, it } from 'vitest'
import { groupCascades } from '../src'
import type { CascadeEntry } from '../src'

const parent = {}
const entry = (name: string, left: number, right: number, overrides: Partial<CascadeEntry<string>> = {}): CascadeEntry<string> => ({
  item: name,
  parent,
  box: { left, right, top: 0, bottom: 24 },
  parentContentRight: 250,
  ...overrides
})

describe('groupCascades', () => {
  it('앞 형제가 넘치면서 밀어낸 뒤쪽 형제는 연쇄 결함으로 묶는다 (이름과 배지)', () => {
    const groups = groupCascades([entry('name', 122, 294), entry('badge', 302, 324)])
    expect(groups).toEqual([{ root: 'name', cascaded: ['badge'] }])
  })

  it('입력 순서와 상관없이 왼쪽에 있는 형제가 원인이 된다', () => {
    expect(groupCascades([entry('badge', 302, 324), entry('name', 122, 294)])).toEqual([{ root: 'name', cascaded: ['badge'] }])
  })

  it('뒤쪽 형제가 부모 콘텐츠 안에서 시작하면 각자 독립된 원인이다', () => {
    const groups = groupCascades([entry('a', 10, 300), entry('b', 100, 400)])
    expect(groups.map((group): string => group.root)).toEqual(['a', 'b'])
    expect(groups.every((group): boolean => group.cascaded.length === 0)).toBe(true)
  })

  it('부모가 다르거나 같은 줄이 아니면 묶지 않는다', () => {
    expect(groupCascades([entry('a', 122, 294), entry('b', 302, 324, { parent: {} })]).map((group): string => group.root)).toEqual(['a', 'b'])
    const otherRow = entry('b', 302, 324, { box: { left: 302, right: 324, top: 40, bottom: 64 } })
    expect(groupCascades([entry('a', 122, 294), otherRow]).map((group): string => group.root)).toEqual(['a', 'b'])
  })

  it('원인 하나가 여러 뒤쪽 형제를 밀어내면 모두 한 원인에 묶고, 이미 묶인 형제를 다시 원인으로 세지 않는다', () => {
    const groups = groupCascades([entry('a', 122, 294), entry('b', 302, 324), entry('c', 332, 360)])
    expect(groups).toEqual([{ root: 'a', cascaded: ['b', 'c'] }])
  })

  it('결과는 입력 순서를 유지한다 (호출한 쪽의 심각도 정렬을 깨지 않는다)', () => {
    const second = { ...entry('second', 10, 300), parent: {} }
    const first = entry('first', 122, 294)
    expect(groupCascades([first, second]).map((group): string => group.root)).toEqual(['first', 'second'])
  })

  it('항목이 하나이거나 비어 있으면 그대로 돌려준다', () => {
    expect(groupCascades([])).toEqual([])
    expect(groupCascades([entry('only', 10, 300)])).toEqual([{ root: 'only', cascaded: [] }])
  })
})
