import { classifySeverity, diagnoseDocWidth } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 문서 폭 미추종: 페이지가 가로로 넘쳐 스크롤되는데, 뷰포트 너비로만 그려진 전체 너비 블록이 그 폭을 따라가지 못하는 경우.
 * 스크롤하면 헤더·푸터의 배경이 끊기고, 오른쪽 padding(우측 여백)이 넘친 내용 뒤로 사라진다.
 * 박스 오버플로우 규칙은 "자식이 부모를 넘는 것"만 보므로, 넘침의 원인과 다른 곳에 있는 배경·여백은 잡지 못한다.
 */

/** 서브픽셀 반올림에 반응하지 않도록 이보다 적게 모자라면 무시한다 */
const MIN_GAP_PX = 2
/** 이보다 좁은 padding-right 는 여백으로 보지 않는다 */
const MIN_PADDING_PX = 4
const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'flow-root', 'list-item', 'table'])

interface Box {
  left: number
  right: number
}

/**
 * 뷰포트 너비를 꽉 채운 박스가 문서 전체 너비(scrollWidth)에 못 미치는 양(px). 0 이면 정상.
 * 뷰포트 오른쪽 끝에서 끝나지 않는 박스(카드, 여백이 있는 본문)는 의도된 폭이라 대상이 아니다.
 */
export const docWidthGapPx = (box: Box, viewportWidth: number, scrollWidth: number): number => {
  if (box.left > 1 || Math.abs(box.right - viewportWidth) > 1) return 0
  const gap = scrollWidth - box.right
  return gap >= MIN_GAP_PX ? gap : 0
}

const hasPaint = (style: CSSStyleDeclaration): boolean => {
  const background = style.backgroundColor
  const transparent = background === 'transparent' || /^rgba\(.*,\s*0\)$/.test(background) || background === 'rgba(0, 0, 0, 0)'
  return !transparent || style.backgroundImage !== 'none' || (parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none')
}

/**
 * @param reported 이미 가로 오버플로우로 보고된 원인 요소. 그 요소를 품은 "여백만 있는" 블록은 같은 원인의 결과라 따로 보고하지 않는다
 */
export const detectDocWidth = (context: RuleContext, reported: readonly Element[]): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const root = document.documentElement
  const scrollWidth = root.scrollWidth
  if (scrollWidth - viewport.width < MIN_GAP_PX) return []

  const rects = new Map<Element, DOMRect>()
  const rectOf = (element: Element): DOMRect => {
    const cached = rects.get(element)
    if (cached) return cached
    const rect = element.getBoundingClientRect()
    rects.set(element, rect)
    return rect
  }

  // 뒤에서부터 훑어 각 요소의 "자손" 내용이 가장 오른쪽까지 닿은 위치를 모은다 (여백 침범 판정용, 자기 자신은 제외)
  const reach = new Map<Element, number>()
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]!
    const style = styleOf(element)
    if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') continue
    const parent = element.parentElement
    if (parent) reach.set(parent, Math.max(reach.get(parent) ?? 0, rectOf(element).right, reach.get(element) ?? 0))
  }

  const qualifies = (element: HTMLElement): { gap: number } | undefined => {
    const style = styleOf(element)
    if (!BLOCK_DISPLAYS.has(style.display) || style.position === 'absolute' || style.position === 'fixed') return undefined
    if (style.overflowX !== 'visible' || element.closest('svg') !== null || element.closest('[data-ia-ignore]') !== null) return undefined
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      if (styleOf(ancestor).overflowX !== 'visible') return undefined
    }
    const rect = rectOf(element)
    const gap = docWidthGapPx(rect, viewport.width, scrollWidth)
    if (gap === 0) return undefined
    if (hasPaint(style)) return { gap }
    // 그려진 것이 없으면 padding-right 가 있고 내용이 그 여백을 침범한 경우만 본다
    const padding = parseFloat(style.paddingRight)
    const intrudes = padding >= MIN_PADDING_PX && (reach.get(element) ?? 0) > rect.right - padding + 1
    const causedByReported = reported.some((culprit): boolean => element.contains(culprit))
    return intrudes && !causedByReported ? { gap } : undefined
  }

  const matched = new Map<HTMLElement, number>()
  for (const element of elements) {
    const result = qualifies(element)
    if (result) matched.set(element, result.gap)
  }

  const found: OverflowDefect[] = []
  for (const [element, gap] of matched) {
    // 바깥 블록을 고치면 안쪽 블록도 같이 펴지므로 가장 바깥 것만 남긴다
    const parent = element.parentElement
    if (!parent || matched.has(parent)) continue
    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x:doc-width', node.source, `${node.selector}::doc-width`, viewport.width)
    // parentContentWidth 는 이 모드에서만 "문서 전체 너비(scrollWidth)"를 뜻한다
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'doc-width',
      overflowPx: Math.round(gap * 100) / 100,
      overflowRatio: Math.round((gap / scrollWidth) * 1000) / 1000,
      parentContentWidth: scrollWidth,
      nodeWidth: Math.round(rectOf(element).width * 100) / 100
    }
    found.push({
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-x',
      severity: classifySeverity(metrics.overflowPx, true),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseDocWidth(node, metrics),
      detectedAt
    })
  }
  return found.sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
