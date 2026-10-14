import { describe, expect, it } from 'vitest'
import { diagnoseDocWidth, docWidthGapPx } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

describe('docWidthGapPx (문서 폭을 못 따라가는 전체 너비 블록)', () => {
  it('뷰포트 너비만큼만 그려진 블록은 문서 전체 너비에 모자란 만큼을 돌려준다', () => {
    expect(docWidthGapPx({ left: 0, right: 100 }, 100, 320)).toBe(220)
  })

  it('문서가 넘치지 않으면 0 이다', () => {
    expect(docWidthGapPx({ left: 0, right: 375 }, 375, 375)).toBe(0)
  })

  it('이미 문서 전체 너비까지 그려진 블록은 0 이다', () => {
    expect(docWidthGapPx({ left: 0, right: 594 }, 375, 594)).toBe(0)
  })

  it('뷰포트 오른쪽 끝에서 끝나지 않는 박스(여백이 있는 카드)는 의도된 폭이라 0 이다', () => {
    expect(docWidthGapPx({ left: 16, right: 359 }, 375, 594)).toBe(0)
    expect(docWidthGapPx({ left: 0, right: 300 }, 375, 594)).toBe(0)
  })

  it('서브픽셀(2px 미만) 차이는 무시한다', () => {
    expect(docWidthGapPx({ left: 0, right: 375 }, 375, 376)).toBe(0)
  })
})

describe('diagnoseDocWidth', () => {
  const node = { selector: 'footer.site-footer', tag: 'footer', classes: ['site-footer'], rect: { x: 0, y: 0, width: 375, height: 48, right: 375, bottom: 48 }, scrollWidth: 375, clientWidth: 375, styles: {}, childElementCount: 1, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'doc-width', overflowPx: 219, overflowRatio: 0.369, parentContentWidth: 594, nodeWidth: 375 }

  it('선언으로 단정할 수 없어 declarations 가 비어 있고, 넘치게 만든 요소를 먼저 고치라고 안내한다(자동 패치 대상 아님)', () => {
    const [suggestion, ...rest] = diagnoseDocWidth(node, metrics)
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'document-overflow-source', declarations: {} })
    expect(suggestion?.reason).toContain('넘치게 만든 요소')
  })
})
