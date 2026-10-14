import { classifySeverity, diagnoseOverlap } from '../diagnose'
import { isTransformed, ownText } from '../dom-utils'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 형제 요소 겹침: 흐름 안에 놓인 글·이미지·컨트롤이 서로 다른 덩어리의 글·이미지·컨트롤 위에 얹혀 읽기·누르기 어려운 경우
 * (예: 음수 margin 으로 끌어올린 제목이 아래 문단을 덮음). 절대/고정/sticky 위치, 변환, 그리드 명시 배치는 의도된 겹침으로 본다.
 * 고정 높이 컨테이너 밖으로 넘친 내용이 만든 겹침은 세로 오버플로우 규칙이 이미 보고하므로 여기서는 제외한다.
 */

/** 이보다 작은 박스는 시각적으로 숨긴 요소(sr-only, 1px 박스)이므로 제외한다 */
const MIN_BOX_PX = 6
/** 겹친 가로·세로가 모두 이만큼은 되어야 한다 */
const MIN_OVERLAP_PX = 4
/**
 * 겹친 넓이가 더 작은 쪽 박스의 이 비율 이상이어야 한다.
 * line-height 1 인 연속한 문단은 글꼴 상자가 2px 남짓 겹치는 것이 정상이라 그보다 확실히 큰 값이어야 한다
 */
const MIN_OVERLAP_RATIO = 0.4
/** 후보가 많은 페이지에서 쌍 비교(제곱)가 폭주하지 않도록 이 개수까지만 본다 */
const MAX_CANDIDATES = 250
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea', 'img', 'video', 'canvas'])

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 두 박스가 얼마나 겹치는지(px). 겹치지 않거나 스치는 정도면 0.
 * 반환값은 떼어 놓으려면 옮겨야 하는 최소 거리(겹친 가로·세로 중 작은 쪽)이다.
 */
export const overlapPx = (a: Box, b: Box): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (width < MIN_OVERLAP_PX || height < MIN_OVERLAP_PX) return 0
  const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top))
  return (width * height) / Math.max(smaller, 1) >= MIN_OVERLAP_RATIO ? Math.min(width, height) : 0
}

interface Candidate {
  element: HTMLElement
  boxes: Box[]
}

const toBox = (rect: DOMRect | DOMRectReadOnly): Box => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })

const ancestorsOf = (element: Element): Element[] => {
  const chain: Element[] = []
  for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) chain.push(current)
  return chain
}

export const detectOverlap = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context

  const isIntentionallyLayered = (element: Element): boolean => {
    for (let current: Element | null = element; current && current !== document.body; current = current.parentElement) {
      const style = styleOf(current)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true
      if (style.position === 'absolute' || style.position === 'fixed' || style.position === 'sticky' || isTransformed(style)) return true
      if (style.position === 'relative' && [style.top, style.left, style.right, style.bottom].some((value): boolean => value !== '0px' && value !== 'auto')) return true
    }
    return element.closest('svg, [data-ia-ignore], [hidden], [inert], [aria-hidden="true"]') !== null
  }

  const candidates: Candidate[] = []
  for (const element of elements) {
    if (candidates.length >= MAX_CANDIDATES) break
    const tag = element.tagName.toLowerCase()
    const isControl = CONTROL_TAGS.has(tag)
    if (!isControl && ownText(element) === '') continue
    if (isIntentionallyLayered(element)) continue

    const boxes: Box[] = []
    if (isControl) {
      boxes.push(toBox(element.getBoundingClientRect()))
    } else {
      // 글은 요소 박스(문단 전체 폭)가 아니라 실제 글줄 상자로 비교한다
      element.childNodes.forEach((child): void => {
        if (child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim() === '') return
        const range = document.createRange()
        range.selectNodeContents(child)
        for (const rect of Array.from(range.getClientRects())) boxes.push(toBox(rect))
      })
    }
    // 스크롤·잘림 영역 안에서 영역 밖으로 넘쳐 보이지 않는 부분은 겹침이 아니므로 보이는 부분만 남긴다
    const clips: Box[] = []
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const ancestorStyle = styleOf(ancestor)
      if (ancestorStyle.overflowX !== 'visible' || ancestorStyle.overflowY !== 'visible') clips.push(toBox(ancestor.getBoundingClientRect()))
    }
    const visible = boxes
      .map((box): Box => clips.reduce((current, clip): Box => ({ left: Math.max(current.left, clip.left), top: Math.max(current.top, clip.top), right: Math.min(current.right, clip.right), bottom: Math.min(current.bottom, clip.bottom) }), box))
      .filter((box): boolean => box.right - box.left >= MIN_BOX_PX && box.bottom - box.top >= MIN_BOX_PX)
    if (visible.length > 0) candidates.push({ element, boxes: visible })
  }

  /** 가장 가까운 공통 조상과, 각 요소가 속한 그 아래 가지의 뿌리 */
  const branchesOf = (a: Element, b: Element): { common: Element | null; branchA: Element; branchB: Element } => {
    const chainA = [a, ...ancestorsOf(a)]
    const chainB = [b, ...ancestorsOf(b)]
    const indexInA = new Map<Element, number>(chainA.map((element, index): [Element, number] => [element, index]))
    const indexB = chainB.findIndex((element): boolean => indexInA.has(element))
    if (indexB === -1) return { common: null, branchA: chainA[chainA.length - 1]!, branchB: chainB[chainB.length - 1]! }
    const common = chainB[indexB]!
    return { common, branchA: chainA[indexInA.get(common)! - 1] ?? a, branchB: chainB[indexB - 1] ?? b }
  }

  /** 가지 안에서 흐름 안 내용이 넘쳐 나오는 컨테이너가 있으면 그 겹침은 오버플로우 규칙의 몫이다 */
  const hasOverflowInside = (element: Element, stopAt: Element | null): boolean => {
    for (let current: Element | null = element; current && current !== stopAt && current !== document.body; current = current.parentElement) {
      const style = styleOf(current)
      const htmlCurrent = current as HTMLElement
      if (style.overflowY === 'visible' && htmlCurrent.clientHeight > 0 && htmlCurrent.scrollHeight - htmlCurrent.clientHeight >= 4) return true
      if (style.overflowX === 'visible' && htmlCurrent.scrollWidth - htmlCurrent.clientWidth >= 2 && current === element) return true
    }
    return false
  }

  const worst = new Map<string, OverflowDefect>()
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const first = candidates[i]!
      const second = candidates[j]!
      if (first.element.contains(second.element) || second.element.contains(first.element)) continue
      let px = 0
      for (const a of first.boxes) for (const b of second.boxes) px = Math.max(px, overlapPx(a, b))
      if (px === 0) continue

      const { common, branchA, branchB } = branchesOf(first.element, second.element)
      if (common && styleOf(common).display.includes('grid')) {
        const placed = (element: Element): boolean => {
          const style = styleOf(element)
          return style.gridRowStart !== 'auto' || style.gridColumnStart !== 'auto'
        }
        if (placed(branchA) || placed(branchB)) continue
      }
      if (hasOverflowInside(first.element, common) || hasOverflowInside(second.element, common)) continue

      // 나중에 그려진(문서에서 뒤쪽) 요소가 앞 요소를 덮는 쪽이므로 그쪽을 고칠 대상으로 본다
      const node = snapshot(second.element)
      const parent = second.element.parentElement
      if (!parent) continue
      const fingerprint = createFingerprint('overflow-x:overlap', node.source, `${node.selector}::overlap`, viewport.width)
      const current = worst.get(fingerprint)
      if (current && current.metrics.overflowPx >= px) continue
      const secondStyle = styleOf(second.element)
      const negativeMargins: Record<string, string> = {}
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const value = secondStyle.getPropertyValue(`margin-${side}`)
        if (parseFloat(value) < 0) negativeMargins[`margin-${side}`] = '0'
      }
      const rect = second.element.getBoundingClientRect()
      const metrics: OverflowMetrics = {
        kind: 'overflow-x',
        mode: 'overlap',
        overflowPx: Math.round(px * 100) / 100,
        overflowRatio: Math.round((px / Math.max(rect.height, 1)) * 1000) / 1000,
        parentContentWidth: Math.round(parent.getBoundingClientRect().width * 100) / 100,
        nodeWidth: Math.round(rect.width * 100) / 100
      }
      worst.set(fingerprint, {
        id: createDefectId(url, fingerprint),
        fingerprint,
        kind: 'overflow-x',
        severity: classifySeverity(metrics.overflowPx, false),
        url,
        viewport,
        node,
        parent: snapshot(parent),
        metrics,
        suggestions: diagnoseOverlap(node, metrics, snapshot(first.element).selector, negativeMargins),
        detectedAt
      })
    }
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
