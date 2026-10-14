import { describe, expect, it } from 'vitest'
import { adjustToContrast, composite, contrastRatio, luminance, toCss } from '../src/rules/color'

describe('색 계산', () => {
  it('검정과 흰색의 대비는 21:1 이다', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
  })

  it('같은 색끼리는 1:1 이다', () => {
    expect(contrastRatio([120, 120, 120], [120, 120, 120])).toBeCloseTo(1, 5)
  })

  it('흰 배경 위 연한 회색(#b0b8c1)은 4.5:1 에 한참 못 미치고 #57606a 는 넘는다', () => {
    expect(contrastRatio([176, 184, 193], [255, 255, 255])).toBeLessThan(2.5)
    expect(contrastRatio([87, 96, 106], [255, 255, 255])).toBeGreaterThan(4.5)
  })

  it('대비 비율은 앞뒤 순서와 무관하다', () => {
    expect(contrastRatio([10, 20, 30], [200, 210, 220])).toBeCloseTo(contrastRatio([200, 210, 220], [10, 20, 30]), 10)
  })

  it('반투명 앞색은 뒷색과 섞인다', () => {
    expect(composite([0, 0, 0, 0.5], [255, 255, 255])).toEqual([128, 128, 128])
    expect(composite([10, 20, 30, 1], [255, 255, 255])).toEqual([10, 20, 30])
  })

  it('밝은 배경에서는 어둡게, 어두운 배경에서는 밝게 옮겨 기준을 채운다', () => {
    const darker = adjustToContrast([176, 184, 193], [255, 255, 255], 4.5)
    expect(contrastRatio(darker, [255, 255, 255])).toBeGreaterThanOrEqual(4.5)
    expect(luminance(darker)).toBeLessThan(luminance([176, 184, 193]))
    const lighter = adjustToContrast([60, 60, 60], [20, 20, 20], 4.5)
    expect(contrastRatio(lighter, [20, 20, 20])).toBeGreaterThanOrEqual(4.5)
    expect(luminance(lighter)).toBeGreaterThan(luminance([60, 60, 60]))
  })

  it('이미 기준을 넘으면 그대로 둔다', () => {
    expect(adjustToContrast([0, 0, 0], [255, 255, 255], 4.5)).toEqual([0, 0, 0])
  })

  it('CSS 문자열로 바꾼다', () => {
    expect(toCss([1, 2, 3])).toBe('rgb(1, 2, 3)')
  })
})
