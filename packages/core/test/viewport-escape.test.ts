import { describe, expect, it } from 'vitest'
import { diagnoseViewportEscape, viewportEscapePx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

const box = (left: number, width: number): { left: number; right: number; width: number } => ({ left, right: left + width, width })

describe('viewportEscapePx (화면 좌우 이탈 판정)', () => {
  it('뷰포트 안이면 0 이다', () => {
    expect(viewportEscapePx(box(16, 300), 375)).toBe(0)
  })

  it('오른쪽으로 나간 만큼을 돌려준다', () => {
    expect(viewportEscapePx(box(100, 368), 375)).toBe(93)
  })

  it('왼쪽으로 나간 만큼을 돌려준다(스크롤로도 닿을 수 없는 쪽)', () => {
    expect(viewportEscapePx(box(-60, 368), 375)).toBe(60)
  })

  it('완전히 화면 밖에 치워 둔 요소(오프캔버스, 스킵 링크)는 의도된 숨김이라 0 이다', () => {
    expect(viewportEscapePx(box(-9999, 200), 375)).toBe(0)
    expect(viewportEscapePx(box(400, 200), 375)).toBe(0)
    expect(viewportEscapePx(box(-200, 200), 375)).toBe(0)
  })

  it('서브픽셀(2px 미만)과 8px 미만 박스는 무시한다', () => {
    expect(viewportEscapePx(box(9, 367), 375)).toBe(0)
    expect(viewportEscapePx(box(370, 6), 375)).toBe(0)
  })
})

describe('diagnoseViewportEscape', () => {
  const node = { selector: 'div.popover', tag: 'div', classes: ['popover'], rect: { x: 0, y: 0, width: 300, height: 100, right: 300, bottom: 100 }, scrollWidth: 300, clientWidth: 300, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'viewport', overflowPx: 60, overflowRatio: 0.2, parentContentWidth: 375, nodeWidth: 300 }

  it('선언 없이 안내만 하는 keep-in-viewport 제안 하나를 돌려준다(자동 패치 대상 아님)', () => {
    const [suggestion, ...rest] = diagnoseViewportEscape(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'keep-in-viewport', declarations: {} })
  })
})
