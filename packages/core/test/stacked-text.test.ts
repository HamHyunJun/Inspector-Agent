import { describe, expect, it } from 'vitest'
import { diagnoseStackedText, isStackedText } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

describe('isStackedText (글자가 세로로 쪼개졌는지)', () => {
  it('"주문내역" 네 글자가 네 줄로 나뉘면 쪼개진 것이다', () => {
    expect(isStackedText(4, 4)).toBe(true)
  })

  it('한 줄 평균 2글자 이하로 세 줄 이상이면 쪼개진 것이다', () => {
    expect(isStackedText(6, 3)).toBe(true)
  })

  it('한 줄에 평균 3글자 이상 보이면 좁은 칸의 정상 줄바꿈이다', () => {
    expect(isStackedText(8, 2)).toBe(false)
    expect(isStackedText(12, 4)).toBe(false)
  })

  it('두 줄까지는 정상 줄바꿈일 수 있어 쪼개진 것이 아니다', () => {
    expect(isStackedText(4, 2)).toBe(false)
  })

  it('글자가 너무 적으면(4자 미만) 판정하지 않는다', () => {
    expect(isStackedText(3, 3)).toBe(false)
  })
})

describe('diagnoseStackedText', () => {
  const node = { selector: 'dt.order-line__label', tag: 'dt', classes: ['order-line__label'], rect: { x: 0, y: 0, width: 18, height: 68, right: 18, bottom: 68 }, scrollWidth: 18, clientWidth: 18, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'stacked-text', overflowPx: 51, overflowRatio: 1, parentContentWidth: 4, nodeWidth: 1 }

  it('단어가 쪼개지지 않게 막는 선언을 제안한다(규칙 기반 자동 패치 대상)', () => {
    const [suggestion, ...rest] = diagnoseStackedText(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'stacked-text', target: 'node', declarations: { 'word-break': 'keep-all', 'min-width': 'min-content' } })
  })
})
