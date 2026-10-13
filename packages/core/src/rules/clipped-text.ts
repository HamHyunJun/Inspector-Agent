import { classifyClippedSeverity, diagnoseClippedText } from '../diagnose'
import { round } from '../dom-utils'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { ClippedTextDefect } from '../types'
import type { RuleContext } from './context'

/**
 * 의도치 않은 텍스트 잘림: overflow: hidden/clip 인데 text-overflow: ellipsis 가 없어서, 글자가 잘렸다는 표시 없이 사라지는 경우.
 * 입력창(input/textarea/select)은 값을 스크롤해서 보므로 제외한다.
 * 캐러셀 카드처럼 블록 자식 안의 텍스트는 의도된 잘림일 가능성이 커서, 요소 자신의 줄(인라인 흐름)에 있는 텍스트만 본다.
 */

/** 서브픽셀 차이에 반응하지 않도록 이보다 적게 잘리면 무시한다 */
const MIN_CLIPPED_PX = 2
/** 이보다 작은 박스는 시각적으로 숨긴 요소(sr-only, 1px 박스)이므로 제외한다 */
const MIN_BOX_PX = 8
/** 한 요소에서 검사할 텍스트 노드 수 상한 (아주 큰 요소에서 비용이 폭증하지 않도록) */
const MAX_TEXT_NODES = 200
const EXCLUDED_TAGS = new Set(['input', 'textarea', 'select', 'option', 'svg', 'canvas', 'img', 'video', 'iframe'])

export interface ClipStyle {
  tag: string
  overflowX: string
  textOverflow: string
  clipPath: string
  clip: string
  lineClamp: string
  maskImage: string
  animationName: string
  clientWidth: number
  clientHeight: number
}

const isNone = (value: string): boolean => value === '' || value === 'none'

/**
 * 이 요소가 "텍스트가 잘릴 수 있는 의도 없는 상태"인지 스타일만으로 판정한다.
 * 의도된 잘림(말줄임, line-clamp, 마스크 페이드, 마퀴 애니메이션, 시각적 숨김)은 제외한다.
 */
export const isTextClipStyle = (style: ClipStyle): boolean =>
  !EXCLUDED_TAGS.has(style.tag) &&
  (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
  style.textOverflow === 'clip' &&
  style.clientWidth >= MIN_BOX_PX &&
  style.clientHeight >= MIN_BOX_PX &&
  isNone(style.clipPath) &&
  (style.clip === 'auto' || style.clip === '') &&
  isNone(style.lineClamp) &&
  isNone(style.maskImage) &&
  isNone(style.animationName)

/** 요소 자신의 줄에 놓인 텍스트인지: 텍스트 부모부터 요소까지 사이에 인라인이 아닌 요소가 없어야 한다 */
const flowsInline = (textParent: Element | null, container: Element, styleOf: RuleContext['styleOf']): boolean => {
  for (let current = textParent; current && current !== container; current = current.parentElement) {
    const display = styleOf(current).display
    if (display !== 'inline' && display !== 'contents') return false
  }
  return textParent !== null
}

export const detectClippedText = (context: RuleContext): ClippedTextDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const found: ClippedTextDefect[] = []

  for (const element of elements) {
    const style = styleOf(element)
    if (
      !isTextClipStyle({
        tag: element.tagName.toLowerCase(),
        overflowX: style.overflowX,
        textOverflow: style.textOverflow,
        clipPath: style.clipPath,
        clip: style.clip,
        lineClamp: style.getPropertyValue('-webkit-line-clamp'),
        maskImage: style.maskImage || style.getPropertyValue('-webkit-mask-image'),
        animationName: style.animationName,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight
      })
    )
      continue
    if (element.scrollWidth - element.clientWidth < MIN_CLIPPED_PX) continue
    if (element.closest('svg') !== null || element.closest('[data-ia-ignore]') !== null) continue
    const parent = element.parentElement
    if (!parent) continue

    // overflow 는 padding box 에서 잘리므로 border 를 뺀 오른쪽 끝이 경계다
    const clipEdge = element.getBoundingClientRect().right - parseFloat(style.borderRightWidth)
    let worst: { clippedPx: number; fullWidth: number; text: string } | undefined
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let visited = 0
    for (let node = walker.nextNode(); node && visited < MAX_TEXT_NODES; node = walker.nextNode(), visited++) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text === '' || !flowsInline(node.parentElement, element, styleOf)) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of Array.from(range.getClientRects())) {
        const clippedPx = rect.right - clipEdge
        if (clippedPx >= MIN_CLIPPED_PX && rect.width > 0 && (!worst || clippedPx > worst.clippedPx)) worst = { clippedPx, fullWidth: rect.width, text }
      }
    }
    if (!worst) continue

    const node = snapshot(element)
    const fingerprint = createFingerprint('clipped-text', node.source, node.selector, viewport.width)
    const metrics = {
      kind: 'clipped-text' as const,
      clippedPx: round(worst.clippedPx),
      hiddenRatio: round(Math.min(worst.clippedPx / worst.fullWidth, 1)),
      visibleWidth: round(element.clientWidth),
      fullWidth: round(worst.fullWidth),
      text: worst.text.slice(0, 60),
      whiteSpace: style.whiteSpace
    }
    found.push({
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'clipped-text',
      severity: classifyClippedSeverity(metrics.hiddenRatio),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseClippedText(node, metrics),
      detectedAt
    })
  }

  const worst = new Map<string, ClippedTextDefect>()
  for (const defect of found) {
    const current = worst.get(defect.fingerprint)
    if (!current || defect.metrics.clippedPx > current.metrics.clippedPx) worst.set(defect.fingerprint, defect)
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.clippedPx - a.metrics.clippedPx)
}
