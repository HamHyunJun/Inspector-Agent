import { describe, expect, it } from 'vitest'
import { diagnoseImageDistortion, distortionPx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

describe('distortionPx (원본 비율에서 늘어난 양)', () => {
  it('160×90 원본을 343×96 으로 그리면 비율에 맞는 높이(193px)와의 차이를 돌려준다', () => {
    expect(distortionPx({ width: 160, height: 90 }, { width: 343, height: 96 })).toBeCloseTo(96.9, 0)
  })

  it('원본 비율대로 그리면 0 이다', () => {
    expect(distortionPx({ width: 160, height: 90 }, { width: 320, height: 180 })).toBe(0)
  })

  it('반올림 수준(3px 미만, 6% 미만)의 어긋남은 무시한다', () => {
    expect(distortionPx({ width: 160, height: 90 }, { width: 320, height: 181 })).toBe(0)
    expect(distortionPx({ width: 100, height: 100 }, { width: 200, height: 190 })).toBe(0)
  })

  it('세로로 늘어난 경우도 잡는다', () => {
    expect(distortionPx({ width: 100, height: 100 }, { width: 100, height: 140 })).toBe(40)
  })

  it('크기를 알 수 없으면(0) 0 이다', () => {
    expect(distortionPx({ width: 0, height: 0 }, { width: 100, height: 100 })).toBe(0)
    expect(distortionPx({ width: 100, height: 100 }, { width: 0, height: 100 })).toBe(0)
  })
})

describe('diagnoseImageDistortion', () => {
  const node = { selector: 'img.thumb__img', tag: 'img', classes: ['thumb__img'], rect: { x: 0, y: 0, width: 343, height: 96, right: 343, bottom: 96 }, scrollWidth: 343, clientWidth: 343, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'distorted', overflowPx: 97, overflowRatio: 0.5, parentContentWidth: 193, nodeWidth: 96 }

  it('object-fit: cover 선언 하나를 제안하고 대안을 안내한다(규칙 기반 자동 패치 대상)', () => {
    const [suggestion, ...rest] = diagnoseImageDistortion(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'image-aspect-ratio', target: 'node', declarations: { 'object-fit': 'cover' } })
    expect(suggestion?.reason).toContain('height: auto')
  })
})
