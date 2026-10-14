import { describe, expect, it } from 'vitest'
import { diagnoseSquished, squishPx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

describe('squishPx (flex 줄에서 한쪽 축으로만 줄어든 양)', () => {
  it('24×24 원형 아이콘이 18.3×24 로 줄면 줄어든 가로 px 를 돌려준다', () => {
    expect(squishPx({ width: 24, height: 24 }, { width: 18.3, height: 24 })).toBeCloseTo(5.7)
  })

  it('세로 방향 flex 에서 높이만 줄어도 찌그러짐이다', () => {
    expect(squishPx({ width: 24, height: 24 }, { width: 24, height: 17 })).toBe(7)
  })

  it('보이지 않을 만큼(0px 가까이) 줄어든 아이콘도 찌그러짐이다', () => {
    expect(squishPx({ width: 16, height: 16 }, { width: 0.4, height: 16 })).toBeCloseTo(15.6)
  })

  it('줄어들지 않았으면 0 이다', () => {
    expect(squishPx({ width: 24, height: 24 }, { width: 24, height: 24 })).toBe(0)
  })

  it('서브픽셀(2px 미만)과 원래 크기의 5% 미만은 무시한다', () => {
    expect(squishPx({ width: 24, height: 24 }, { width: 22.5, height: 24 })).toBe(0)
    expect(squishPx({ width: 100, height: 40 }, { width: 96, height: 40 })).toBe(0)
  })

  it('다른 축도 함께 변했다면(줄바꿈으로 높이가 달라진 텍스트 상자) 찌그러짐이 아니다', () => {
    expect(squishPx({ width: 200, height: 20 }, { width: 120, height: 40 })).toBe(0)
  })
})

describe('diagnoseSquished', () => {
  const node = { selector: 'span.lock', tag: 'span', classes: ['lock'], rect: { x: 0, y: 0, width: 18, height: 24, right: 18, bottom: 24 }, scrollWidth: 18, clientWidth: 18, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'squished', overflowPx: 6, overflowRatio: 0.25, parentContentWidth: 24, nodeWidth: 18 }

  it('줄어들지 않게 막는 flex-shrink: 0 선언 하나를 제안한다(규칙 기반 자동 패치 대상)', () => {
    const [suggestion, ...rest] = diagnoseSquished(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'flex-shrink-disabled', target: 'node', declarations: { 'flex-shrink': '0' } })
  })
})
