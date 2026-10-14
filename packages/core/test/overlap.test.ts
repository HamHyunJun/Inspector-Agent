import { describe, expect, it } from 'vitest'
import { diagnoseOverlap, overlapPx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

const box = (left: number, top: number, right: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({ left, top, right, bottom })

describe('overlapPx (두 박스가 겹친 정도)', () => {
  it('글줄 상자가 절반 이상 겹치면 떼어 놓으려면 옮겨야 하는 거리(작은 쪽 변)를 돌려준다', () => {
    expect(overlapPx(box(0, 0, 200, 22), box(0, 10, 300, 32))).toBe(12)
  })

  it('겹치지 않거나 맞닿기만 하면 0 이다', () => {
    expect(overlapPx(box(0, 0, 100, 20), box(0, 20, 100, 40))).toBe(0)
    expect(overlapPx(box(0, 0, 100, 20), box(150, 0, 250, 20))).toBe(0)
  })

  it('줄 높이 1 인 문단처럼 글꼴 상자가 2px 남짓 닿는 정도는 무시한다', () => {
    expect(overlapPx(box(0, 0, 300, 16), box(0, 14, 300, 30))).toBe(0)
  })

  it('가로·세로 어느 쪽이든 4px 미만으로 스치면 무시한다', () => {
    expect(overlapPx(box(0, 0, 100, 20), box(97, 0, 200, 20))).toBe(0)
  })

  it('작은 박스가 큰 박스 안에 거의 들어가 있으면 작은 쪽 변이 거리가 된다', () => {
    expect(overlapPx(box(0, 0, 200, 100), box(10, 10, 40, 30))).toBe(20)
  })
})

describe('diagnoseOverlap', () => {
  const node = { selector: 'p.overlap__desc', tag: 'p', classes: ['overlap__desc'], rect: { x: 0, y: 0, width: 300, height: 20, right: 300, bottom: 20 }, scrollWidth: 300, clientWidth: 300, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'overlap', overflowPx: 12, overflowRatio: 0.6, parentContentWidth: 300, nodeWidth: 300 }

  it('음수 margin 이 원인이면 그 margin 을 0 으로 되돌리는 선언을 제안한다(규칙 기반 자동 패치 대상)', () => {
    const [suggestion, ...rest] = diagnoseOverlap(node, metrics, 'h2.overlap__title', { 'margin-top': '0' })
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'sibling-overlap', target: 'node', declarations: { 'margin-top': '0' } })
    expect(suggestion?.reason).toContain('h2.overlap__title')
  })

  it('원인을 선언으로 단정할 수 없으면 declarations 가 비어 있다(자동 패치 대상 아님)', () => {
    const [suggestion] = diagnoseOverlap(node, metrics, 'h2.overlap__title', {})
    expect(suggestion?.declarations).toEqual({})
  })
})
