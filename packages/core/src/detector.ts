import { classifySeverity, diagnose } from './diagnose'
import { createDefectId, createFingerprint, parseSourceAttribute } from './fingerprint'
import type { Defect, DetectOptions, NodeSnapshot, OverflowMetrics, Rect, ScanResult } from './types'

/**
 * 브라우저 안에서 실행되는 결정론적 가로 오버플로우 탐지기.
 * LLM 없이 렌더 트리 수치(getBoundingClientRect, scrollWidth, ComputedStyle)만으로 판정한다.
 */

const SKIPPED_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'br', 'wbr'])

/** 페이로드에 담을 레이아웃 속성과 그 기본값. 기본값과 같으면 생략해 토큰을 줄인다 */
const LAYOUT_PROPERTIES: Record<string, string> = {
  display: '',
  position: 'static',
  'box-sizing': 'content-box',
  'min-width': 'auto',
  'max-width': 'none',
  'flex-direction': 'row',
  'flex-wrap': 'nowrap',
  'flex-grow': '0',
  'flex-shrink': '1',
  'flex-basis': 'auto',
  'grid-template-columns': 'none',
  'column-gap': 'normal',
  'white-space': 'normal',
  'word-break': 'normal',
  'overflow-wrap': 'normal',
  'overflow-x': 'visible',
  'text-overflow': 'clip',
  'padding-left': '0px',
  'padding-right': '0px',
  'margin-left': '0px',
  'margin-right': '0px'
}

const FLEX_ITEM_PROPERTIES = new Set(['flex-grow', 'flex-shrink', 'flex-basis'])
const FLEX_CONTAINER_PROPERTIES = new Set(['flex-direction', 'flex-wrap'])

const round = (value: number): number => Math.round(value * 10) / 10

const toRect = (rect: DOMRect): Rect => ({
  x: round(rect.x),
  y: round(rect.y),
  width: round(rect.width),
  height: round(rect.height),
  right: round(rect.right),
  bottom: round(rect.bottom)
})

const isFlexDisplay = (display: string): boolean => display === 'flex' || display === 'inline-flex'

const pickStyles = (style: CSSStyleDeclaration, parentStyle: CSSStyleDeclaration | undefined): Record<string, string> => {
  const picked: Record<string, string> = {}
  const isFlexItem = parentStyle !== undefined && isFlexDisplay(parentStyle.display)
  const isFlexContainer = isFlexDisplay(style.display)
  for (const [property, defaultValue] of Object.entries(LAYOUT_PROPERTIES)) {
    if (FLEX_ITEM_PROPERTIES.has(property) && !isFlexItem) continue
    if (FLEX_CONTAINER_PROPERTIES.has(property) && !isFlexContainer) continue
    const value = style.getPropertyValue(property)
    if (value === '' || value === defaultValue) continue
    picked[property] = value
  }
  // flex item 판단에는 기본값(min-width:auto)이 오히려 핵심 단서이므로 명시적으로 남긴다
  if (isFlexItem && picked['min-width'] === undefined) picked['min-width'] = 'auto'
  return picked
}

const ownText = (element: Element): string => {
  let text = ''
  element.childNodes.forEach((child): void => {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ''
  })
  return text.replace(/\s+/g, ' ').trim()
}

const collectChildClasses = (element: Element): string[] => {
  const classes = Array.from(element.children).flatMap((child): string[] => Array.from(child.classList))
  return Array.from(new Set(classes)).slice(0, 8)
}

const buildSelector = (element: Element): string => {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 4) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`${tag}#${current.id}`)
      break
    }
    const classes = Array.from(current.classList)
      .filter((name): boolean => !name.startsWith('data-v-'))
      .slice(0, 2)
    let part = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag
    const parentElement: Element | null = current.parentElement
    if (parentElement) {
      const sameTag = Array.from(parentElement.children).filter((child): boolean => child.tagName === current?.tagName)
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
    }
    parts.unshift(part)
    current = parentElement
  }
  return parts.join(' > ')
}

export const detect = (options: DetectOptions = {}): ScanResult => {
  const startedAt = performance.now()
  const thresholdPx = options.thresholdPx ?? 1
  const maxDefects = options.maxDefects ?? 50
  const sourceAttribute = options.sourceAttribute ?? 'data-ia-src'
  const root = document.documentElement
  const viewport = { width: root.clientWidth, height: window.innerHeight }
  const styleCache = new Map<Element, CSSStyleDeclaration>()

  const styleOf = (element: Element): CSSStyleDeclaration => {
    const cached = styleCache.get(element)
    if (cached) return cached
    const computed = getComputedStyle(element)
    styleCache.set(element, computed)
    return computed
  }

  /** 조상 중 overflow를 자르거나 스크롤로 처리하는 요소가 있으면 의도된 오버플로우로 본다 */
  const isContainedByAncestor = (element: Element): boolean => {
    let current = element.parentElement
    while (current && current !== document.body && current !== root) {
      const overflowX = styleOf(current).overflowX
      if (overflowX !== 'visible') return true
      current = current.parentElement
    }
    return false
  }

  const snapshot = (element: HTMLElement): NodeSnapshot => {
    const style = styleOf(element)
    const parentStyle = element.parentElement ? styleOf(element.parentElement) : undefined
    const ownSource = element.getAttribute(sourceAttribute)
    const borrowed = ownSource ? undefined : element.closest(`[${sourceAttribute}]`)?.getAttribute(sourceAttribute)
    const sourceValue = ownSource ?? borrowed
    const text = ownText(element)
    return {
      selector: buildSelector(element),
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      source: sourceValue ? parseSourceAttribute(sourceValue, ownSource !== null) : undefined,
      rect: toRect(element.getBoundingClientRect()),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      styles: pickStyles(style, parentStyle),
      childElementCount: element.childElementCount,
      childClasses: collectChildClasses(element),
      text: text ? text.slice(0, 60) : undefined
    }
  }

  interface Candidate {
    element: HTMLElement
    parent: HTMLElement
    metrics: OverflowMetrics
  }

  const candidates: Candidate[] = []
  const elements = Array.from(document.body.querySelectorAll<HTMLElement>('*'))

  for (const element of elements) {
    const tag = element.tagName.toLowerCase()
    if (SKIPPED_TAGS.has(tag) || (tag !== 'svg' && element.closest('svg') !== null)) continue
    if (element.closest('[data-ia-ignore]')) continue
    const parent = element.parentElement
    if (!parent) continue

    const style = styleOf(element)
    if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') continue
    if (isContainedByAncestor(element)) continue

    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    const parentStyle = styleOf(parent)
    const parentRect = parent.getBoundingClientRect()
    const parentContentLeft = parentRect.left + parseFloat(parentStyle.borderLeftWidth) + parseFloat(parentStyle.paddingLeft)
    const parentContentRight = parentRect.right - parseFloat(parentStyle.borderRightWidth) - parseFloat(parentStyle.paddingRight)
    const parentContentWidth = Math.max(parentContentRight - parentContentLeft, 1)

    // 1) 박스 자체가 부모 콘텐츠 영역을 넘는 경우
    const boxOverflow = rect.right - parentContentRight
    if (boxOverflow > thresholdPx) {
      candidates.push({
        element,
        parent,
        metrics: {
          mode: 'box',
          overflowPx: round(boxOverflow),
          overflowRatio: round(boxOverflow / parentContentWidth),
          parentContentWidth: round(parentContentWidth),
          nodeWidth: round(rect.width)
        }
      })
      continue
    }

    // 2) 박스는 맞지만 직접 가진 텍스트가 박스를 넘는 경우 (overflow: visible 일 때만 눈에 보인다)
    const contentOverflow = element.scrollWidth - element.clientWidth
    if (style.overflowX === 'visible' && contentOverflow > thresholdPx && ownText(element) !== '') {
      candidates.push({
        element,
        parent,
        metrics: {
          mode: 'content',
          overflowPx: round(contentOverflow),
          overflowRatio: round(contentOverflow / Math.max(element.clientWidth, 1)),
          parentContentWidth: round(parentContentWidth),
          nodeWidth: round(element.scrollWidth)
        }
      })
    }
  }

  // 같은 오버플로우가 조상으로 전파된 중복을 제거하고 가장 깊은 원인 노드만 남긴다
  const culprits = candidates.filter(
    (candidate): boolean =>
      !candidates.some(
        (other): boolean =>
          other !== candidate &&
          candidate.element.contains(other.element) &&
          Math.abs(other.metrics.overflowPx - candidate.metrics.overflowPx) <= 2
      )
  )

  const documentOverflowPx = Math.max(root.scrollWidth - root.clientWidth, 0)
  const url = location.href
  const detectedAt = new Date().toISOString()

  const seenFingerprints = new Set<string>()
  const defects: Defect[] = culprits
    .sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
    .map((candidate): Defect => {
      const node = snapshot(candidate.element)
      const parent = snapshot(candidate.parent)
      const visibleRight = candidate.metrics.mode === 'box' ? node.rect.right : node.rect.x + node.scrollWidth
      const causesPageScroll = documentOverflowPx > 0 && visibleRight > viewport.width
      const fingerprint = createFingerprint('overflow-x', node.source, node.selector, viewport.width)
      return {
        id: createDefectId(url, fingerprint),
        fingerprint,
        kind: 'overflow-x',
        severity: classifySeverity(candidate.metrics.overflowPx, causesPageScroll),
        url,
        viewport,
        node,
        parent,
        metrics: candidate.metrics,
        suggestions: diagnose(node, parent, candidate.metrics),
        detectedAt
      }
    })
    // v-for 로 렌더된 형제들은 같은 소스 위치를 공유하므로 가장 심한 하나만 남긴다
    .filter((defect): boolean => {
      if (seenFingerprints.has(defect.fingerprint)) return false
      seenFingerprints.add(defect.fingerprint)
      return true
    })
    .slice(0, maxDefects)

  return {
    url,
    viewport,
    documentOverflowPx,
    defects,
    stats: { scannedNodes: elements.length, durationMs: round(performance.now() - startedAt) }
  }
}
