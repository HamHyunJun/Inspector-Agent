import { classifyVerticalSeverity, diagnoseVertical } from '../diagnose'
import { buildSelector, isTransformed, round } from '../dom-utils'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { VerticalOverflowDefect } from '../types'
import type { RuleContext } from './context'

/**
 * 세로 오버플로우: 높이가 제한된 컨테이너(overflow-y: visible) 밖으로 **흐름 안의** 콘텐츠가 넘쳐 아래 요소와 겹치는 경우.
 * 스크롤·잘림 컨테이너, 절대 위치 팝업, float, 변환된 자식은 의도된 것으로 보고 제외한다.
 */

/** 글꼴 반올림 같은 서브픽셀 차이에 반응하지 않도록 이보다 작은 넘침은 무시한다 */
const MIN_VERTICAL_OVERFLOW_PX = 4

export interface VerticalCandidateStyle {
  display: string
  overflowY: string
  clientHeight: number
  scrollHeight: number
}

/** 스타일과 레이아웃 수치만으로 하는 1차 판정(빠르다). 자식 좌표로 하는 정밀 판정은 이후에 한다 */
export const isVerticalCandidate = (style: VerticalCandidateStyle): boolean =>
  style.overflowY === 'visible' &&
  style.display !== 'none' &&
  style.display !== 'inline' &&
  style.display !== 'contents' &&
  style.clientHeight > 0 &&
  style.scrollHeight - style.clientHeight >= MIN_VERTICAL_OVERFLOW_PX

export const detectVerticalOverflow = (context: RuleContext): VerticalOverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const found: VerticalOverflowDefect[] = []

  for (const element of elements) {
    const style = styleOf(element)
    if (!isVerticalCandidate({ display: style.display, overflowY: style.overflowY, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight })) continue
    if (element.tagName.toLowerCase() === 'svg' || element.closest('svg') !== null || element.closest('[data-ia-ignore]') !== null) continue
    const parent = element.parentElement
    if (!parent) continue

    // 시각적 경계는 border 를 뺀 padding box 의 아래쪽 끝이다. 그 아래로 나온 흐름 안 콘텐츠가 넘침이다
    const box = element.getBoundingClientRect()
    const containerBottom = box.bottom - parseFloat(style.borderBottomWidth)
    let contentBottom = -Infinity
    let culprit: Element | undefined

    for (const child of Array.from(element.children)) {
      const childStyle = styleOf(child)
      if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue
      // 절대/고정 위치(팝업), float(clearfix 없는 컨테이너), 변환(getBoundingClientRect 가 변환 후 좌표)은 흐름 밖이다
      if (childStyle.position === 'absolute' || childStyle.position === 'fixed' || childStyle.float !== 'none' || isTransformed(childStyle)) continue
      const rect = child.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.bottom > contentBottom) {
        contentBottom = rect.bottom
        culprit = child
      }
    }
    // 요소 사이에 직접 놓인 텍스트(줄바꿈된 글)도 넘칠 수 있다
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node): number => (node.parentNode === element && (node.textContent ?? '').trim() !== '' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (rect.height > 0 && rect.bottom > contentBottom) {
        contentBottom = rect.bottom
        culprit = undefined
      }
    }

    const overflowPx = contentBottom - containerBottom
    if (!Number.isFinite(overflowPx) || overflowPx < MIN_VERTICAL_OVERFLOW_PX) continue
    // 넘친 부분이 조상의 overflow: hidden/clip 에 잘려 보이지 않으면 겹침이 아니므로 제외한다
    let hiddenByAncestor = false
    for (let current: Element | null = parent; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
      const ancestorStyle = styleOf(current)
      if ((ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowY === 'clip') && contentBottom > current.getBoundingClientRect().bottom + 1) {
        hiddenByAncestor = true
        break
      }
    }
    if (hiddenByAncestor) continue

    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-y', node.source, node.selector, viewport.width)
    const metrics = {
      kind: 'overflow-y' as const,
      overflowPx: round(overflowPx),
      containerHeight: round(element.clientHeight),
      contentHeight: round(contentBottom - (box.top + parseFloat(style.borderTopWidth))),
      culprit: culprit ? { selector: buildSelector(culprit), source: snapshot(culprit).source } : undefined
    }
    found.push({
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-y',
      severity: classifyVerticalSeverity(metrics.overflowPx),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseVertical(node, metrics),
      detectedAt
    })
  }

  // v-for 로 렌더된 같은 컴포넌트는 소스 위치를 공유하므로 가장 심한 하나만 남긴다
  const worst = new Map<string, VerticalOverflowDefect>()
  for (const defect of found) {
    const current = worst.get(defect.fingerprint)
    if (!current || defect.metrics.overflowPx > current.metrics.overflowPx) worst.set(defect.fingerprint, defect)
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
