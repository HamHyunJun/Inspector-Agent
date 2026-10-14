import { describe, expect, it } from 'vitest'
import { heightGapPx, isNestedScroll, isTooLongLine, requiredContrast, scrollEndGapPx } from '../src'

describe('글자 대비 기준', () => {
  it('일반 글자는 4.5:1, 24px 이상이나 굵은 18.66px 이상은 3:1 이다', () => {
    expect(requiredContrast(14, 400)).toBe(4.5)
    expect(requiredContrast(24, 400)).toBe(3)
    expect(requiredContrast(19, 700)).toBe(3)
    expect(requiredContrast(19, 400)).toBe(4.5)
  })
})

describe('같은 행 카드 높이 차', () => {
  it('24px 이상이고 가장 큰 카드의 20% 이상일 때만 들쭉날쭉이다', () => {
    expect(heightGapPx([60, 140, 60])).toBe(80)
    expect(heightGapPx([100, 110])).toBe(0)
    expect(heightGapPx([300, 270])).toBe(0)
    expect(heightGapPx([100])).toBe(0)
  })
})

describe('너무 긴 줄', () => {
  it('긴 글에서 한 줄 평균이 100글자를 넘을 때만 결함이다', () => {
    expect(isTooLongLine(480, 4)).toBe(true)
    expect(isTooLongLine(480, 8)).toBe(false)
    expect(isTooLongLine(120, 1)).toBe(false)
  })
})

describe('가로 스크롤 목록 끝 여백', () => {
  it('앞 여백은 있고 끝 여백이 없으면 비대칭인 양을 돌려준다', () => {
    expect(scrollEndGapPx(16, 0)).toBe(16)
    expect(scrollEndGapPx(16, 16)).toBe(0)
    expect(scrollEndGapPx(4, 0)).toBe(0)
    expect(scrollEndGapPx(0, 0)).toBe(0)
  })
})

describe('이중 스크롤', () => {
  it('페이지도 스크롤되고 안쪽 영역이 화면의 60% 이상일 때만 이중 스크롤이다', () => {
    expect(isNestedScroll(570, 812, true)).toBe(true)
    expect(isNestedScroll(120, 812, true)).toBe(false)
    expect(isNestedScroll(570, 812, false)).toBe(false)
  })
})
