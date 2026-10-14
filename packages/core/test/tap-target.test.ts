import { describe, expect, it } from 'vitest'
import { crowdsTarget, diagnoseTapTarget, tapShortfallPx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

const box = (left: number, top: number, right: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({ left, top, right, bottom })

describe('tapShortfallPx (24px 기준에 모자란 양)', () => {
  it('18×18 타겟은 6px 모자란다', () => {
    expect(tapShortfallPx(box(0, 0, 18, 18))).toBe(6)
  })

  it('한 변만 작아도 그만큼 모자란다', () => {
    expect(tapShortfallPx(box(0, 0, 200, 17))).toBe(7)
  })

  it('24px 이상이면 0 이다', () => {
    expect(tapShortfallPx(box(0, 0, 24, 24))).toBe(0)
    expect(tapShortfallPx(box(0, 0, 100, 44))).toBe(0)
  })
})

describe('crowdsTarget (간격 예외 판정)', () => {
  const small = box(100, 0, 118, 18)

  it('주변에 다른 타겟이 없으면 작아도 통과한다', () => {
    expect(crowdsTarget(small, [])).toBe(false)
  })

  it('중심의 24px 원이 큰 타겟 박스와 닿으면 걸린다', () => {
    expect(crowdsTarget(small, [box(60, 0, 98, 36)])).toBe(true)
  })

  it('큰 타겟이 24px 원 밖으로 충분히 떨어져 있으면 통과한다', () => {
    expect(crowdsTarget(small, [box(60, 0, 90, 36)])).toBe(false)
  })

  it('작은 타겟끼리는 중심 간격이 24px 미만이면 걸리고 이상이면 통과한다', () => {
    expect(crowdsTarget(small, [box(120, 0, 138, 18)])).toBe(true)
    expect(crowdsTarget(small, [box(140, 0, 158, 18)])).toBe(false)
  })
})

describe('diagnoseTapTarget', () => {
  const node = { selector: 'button.bar__close', tag: 'button', classes: ['bar__close'], rect: { x: 0, y: 0, width: 18, height: 18, right: 18, bottom: 18 }, scrollWidth: 18, clientWidth: 18, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'tap-target', overflowPx: 6, overflowRatio: 0.25, parentContentWidth: 24, nodeWidth: 18 }

  it('24px 최소 크기 선언을 제안한다(규칙 기반 자동 패치 대상)', () => {
    const [suggestion, ...rest] = diagnoseTapTarget(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'tap-target-size', target: 'node', declarations: { 'min-width': '24px', 'min-height': '24px' } })
  })
})
