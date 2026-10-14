import { describe, expect, it } from 'vitest'
import { isFakeButton, isScrollLocked, MIN_LAYOUT_SHIFT } from '../src'

describe('클릭만 되는 가짜 버튼', () => {
  const base = { tag: 'div', hasHref: false, role: '', hasTabindex: false, cursor: 'pointer', parentCursor: 'auto', hasContent: true }

  it('cursor: pointer 의 출처인 div 는 가짜 버튼이다', () => {
    expect(isFakeButton(base)).toBe(true)
  })

  it('href 가 없는 a 도 포커스할 수 없어 가짜 버튼이다', () => {
    expect(isFakeButton({ ...base, tag: 'a' })).toBe(true)
    expect(isFakeButton({ ...base, tag: 'a', hasHref: true })).toBe(false)
  })

  it('네이티브 상호작용 태그, 상호작용 role, tabindex 가 있으면 아니다', () => {
    expect(isFakeButton({ ...base, tag: 'button' })).toBe(false)
    expect(isFakeButton({ ...base, tag: 'label' })).toBe(false)
    expect(isFakeButton({ ...base, role: 'button' })).toBe(false)
    expect(isFakeButton({ ...base, hasTabindex: true })).toBe(false)
  })

  it('부모에게서 상속받은 pointer 이거나 내용이 없는 레이어면 아니다', () => {
    expect(isFakeButton({ ...base, parentCursor: 'pointer' })).toBe(false)
    expect(isFakeButton({ ...base, hasContent: false })).toBe(false)
    expect(isFakeButton({ ...base, cursor: 'auto' })).toBe(false)
  })
})

describe('스크롤 잠금', () => {
  const base = { overflowY: 'hidden', position: 'static', scrollHeight: 2400, clientHeight: 812, modalOpen: false }

  it('모달이 없는데 overflow 로 막혀 있고 문서가 넘치면 잠금이다', () => {
    expect(isScrollLocked(base)).toBe(true)
    expect(isScrollLocked({ ...base, overflowY: 'visible', position: 'fixed' })).toBe(true)
  })

  it('열린 모달이 있으면 정상이다', () => {
    expect(isScrollLocked({ ...base, modalOpen: true })).toBe(false)
  })

  it('문서가 넘치지 않으면(40px 이하) 막혀 있어도 문제가 아니다', () => {
    expect(isScrollLocked({ ...base, scrollHeight: 830 })).toBe(false)
  })

  it('overflow 가 auto/visible 이고 고정도 아니면 정상이다', () => {
    expect(isScrollLocked({ ...base, overflowY: 'auto' })).toBe(false)
  })
})

describe('레이아웃 이동 기준', () => {
  it('Core Web Vitals 의 개선 필요 기준 0.1 이다', () => {
    expect(MIN_LAYOUT_SHIFT).toBe(0.1)
  })
})
