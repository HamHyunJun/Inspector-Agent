import { classifySeverity, diagnose, diagnoseOcclusion } from './diagnose'
import { createDefectId, createFingerprint, parseSourceAttribute } from './fingerprint'
import { groupCascades } from './cascade'
import type { CascadeEntry } from './cascade'
import { classifyOcclusionSeverity, compareStacking, effectiveZIndex, stackingReason } from './occlusion'
import type { ChainLayer, StackStyle } from './occlusion'
import type {
  CascadedDefect,
  Defect,
  DetectOptions,
  NodeSnapshot,
  OcclusionDefect,
  OcclusionMetrics,
  OverflowDefect,
  OverflowMetrics,
  Rect,
  ScanResult,
  StackingLayer
} from './types'

/**
 * 브라우저 안에서 실행되는 결정론적 가로 오버플로우 탐지기.
 * LLM 없이 렌더 트리 수치(getBoundingClientRect, scrollWidth, ComputedStyle)만으로 판정한다.
 */

/** "다른 요소 위에 보여야 하는" 팝업으로 보는 role. tooltip 은 장식이라 제외한다 */
const POPUP_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox'])
const POPUP_SELECTOR = 'dialog[open], [popover], [aria-modal="true"]'
const MODAL_LAYER_SELECTOR = 'dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]'
const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
/** 표본점 5개 중 이 비율 이상 가려져야 결함으로 본다 (모서리 몇 px 겹침은 무시) */
export const DEFAULT_MIN_COVERED_RATIO = 0.6
const MIN_SAMPLED_POINTS = 3
/** 후보가 많은 페이지에서 elementFromPoint 로 레이아웃을 강제하지 않도록 이 개수까지만 본다. 의미(role 등)가 있는 후보를 먼저 채운다 */
const MAX_OCCLUSION_CANDIDATES = 20
/** 위치(absolute/fixed + z-index)만 근거인 후보는 이보다 작으면 장식(배지, 점, 아이콘)으로 보고 제외한다 */
const MIN_POSITIONED_CANDIDATE_PX = 24

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

/** transform/rotate/scale/translate 가 걸렸는지. getBoundingClientRect 는 변환 후 사각형이라 레이아웃 박스와 달라진다 */
const isTransformed = (style: CSSStyleDeclaration): boolean =>
  [style.transform, style.rotate, style.scale, style.translate].some((value): boolean => value !== '' && value !== 'none')

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

/** 요소 하나를 압축 스냅샷으로 만든다. detect 와 포커스 탐침(focus.ts)이 같은 모양을 쓰도록 공유한다 */
export const createSnapshotter =
  (styleOf: (element: Element) => CSSStyleDeclaration, sourceAttribute: string) =>
  (element: Element): NodeSnapshot => {
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

export const detect = (options: DetectOptions = {}): ScanResult => {
  const startedAt = performance.now()
  const thresholdPx = options.thresholdPx ?? 1
  const maxDefects = options.maxDefects ?? 50
  const sourceAttribute = options.sourceAttribute ?? 'data-ia-src'
  const minCoveredRatio = options.minCoveredRatio ?? DEFAULT_MIN_COVERED_RATIO
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

  const snapshot = createSnapshotter(styleOf, sourceAttribute)

  interface Candidate {
    element: HTMLElement
    parent: HTMLElement
    metrics: OverflowMetrics
    parentContentRight: number
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
    // shortcut: 자신이나 부모에 transform 이 있으면 박스 판정을 건너뛴다(회전 아이콘 오탐 방지). 변환된 요소의 진짜 오버플로우는 2) 만 본다, 레이아웃 좌표(offset*)로 판정하게 되면 업그레이드
    const boxOverflow = isTransformed(style) || isTransformed(parentStyle) ? 0 : rect.right - parentContentRight
    if (boxOverflow > thresholdPx) {
      candidates.push({
        element,
        parent,
        parentContentRight,
        metrics: {
          kind: 'overflow-x',
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
        parentContentRight,
        metrics: {
          kind: 'overflow-x',
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

  interface Entry {
    candidate: Candidate
    node: NodeSnapshot
    parent: NodeSnapshot
    fingerprint: string
  }

  const entries: Entry[] = culprits
    .sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
    .map((candidate): Entry => {
      const node = snapshot(candidate.element)
      return {
        candidate,
        node,
        parent: snapshot(candidate.parent),
        fingerprint: createFingerprint('overflow-x', node.source, node.selector, viewport.width)
      }
    })

  // v-for 로 렌더된 형제들은 같은 소스 위치를 공유하므로 가장 심한 하나만 남긴다
  const seenFingerprints = new Set<string>()
  const unique = entries.filter((entry): boolean => {
    if (seenFingerprints.has(entry.fingerprint)) return false
    seenFingerprints.add(entry.fingerprint)
    return true
  })

  // 한 원인이 같은 줄의 뒤쪽 형제를 밖으로 밀어낸 경우(예: 긴 이름이 배지를 밀어냄)는 원인 하나로 묶고 나머지는 연쇄 결함으로 남긴다
  const chainable = unique.filter((entry): boolean => entry.candidate.metrics.mode === 'box')
  const cascadeGroups = groupCascades(
    chainable.map((entry): CascadeEntry<Entry> => ({
      item: entry,
      parent: entry.candidate.parent,
      box: { left: entry.node.rect.x, right: entry.node.rect.right, top: entry.node.rect.y, bottom: entry.node.rect.bottom },
      parentContentRight: entry.candidate.parentContentRight
    })),
    thresholdPx
  )
  const cascadedOf = new Map<Entry, Entry[]>(cascadeGroups.map((group): [Entry, Entry[]] => [group.root, group.cascaded]))
  const absorbed = new Set<Entry>(cascadeGroups.flatMap((group): Entry[] => group.cascaded))

  const overflowDefects: OverflowDefect[] = unique
    .filter((entry): boolean => !absorbed.has(entry))
    .map((entry): OverflowDefect => {
      const { candidate, node, parent, fingerprint } = entry
      const cascaded = (cascadedOf.get(entry) ?? []).map(
        (other): CascadedDefect => ({ selector: other.node.selector, source: other.node.source, overflowPx: other.candidate.metrics.overflowPx })
      )
      const metrics: OverflowMetrics = cascaded.length > 0 ? { ...candidate.metrics, cascaded } : candidate.metrics
      const visibleRight = candidate.metrics.mode === 'box' ? node.rect.right : node.rect.x + node.scrollWidth
      const causesPageScroll = documentOverflowPx > 0 && visibleRight > viewport.width
      return {
        id: createDefectId(url, fingerprint),
        fingerprint,
        kind: 'overflow-x',
        severity: classifySeverity(candidate.metrics.overflowPx, causesPageScroll),
        url,
        viewport,
        node,
        parent,
        metrics,
        suggestions: diagnose(node, parent, metrics),
        detectedAt
      }
    })
    .slice(0, maxDefects)

  // 가려짐 결함: 위에 있어야 할 팝업이 elementFromPoint 로 확인한 실제 최상단 요소에 가려지는지 본다
  const documentOrder = new Map<Element, number>([root, document.body, ...elements].map((element, index): [Element, number] => [element, index]))
  const orderedElements = Array.from(documentOrder.keys())

  const stackStyleOf = (element: Element): StackStyle => {
    const style = styleOf(element)
    return {
      position: style.position,
      zIndex: style.zIndex,
      opacity: style.opacity,
      transform: style.transform,
      rotate: style.rotate,
      scale: style.scale,
      translate: style.translate,
      filter: style.filter,
      backdropFilter: style.getPropertyValue('backdrop-filter'),
      perspective: style.perspective,
      clipPath: style.clipPath,
      isolation: style.isolation,
      mixBlendMode: style.mixBlendMode,
      willChange: style.willChange,
      contain: style.getPropertyValue('contain'),
      parentDisplay: element.parentElement ? styleOf(element.parentElement).display : ''
    }
  }

  /** html → element 순서의 조상 체인 */
  const chainOf = (element: Element): ChainLayer[] => {
    const chain: ChainLayer[] = []
    for (let current: Element | null = element; current; current = current.parentElement) {
      const stack = stackStyleOf(current)
      chain.unshift({
        id: String(documentOrder.get(current)),
        selector: buildSelector(current),
        zIndex: effectiveZIndex(stack),
        reason: stackingReason(stack),
        order: documentOrder.get(current) ?? 0
      })
    }
    return chain
  }

  const toStackingLayer = (layer: ChainLayer): StackingLayer => {
    const element = orderedElements[Number(layer.id)]
    const sourceValue = element?.closest(`[${sourceAttribute}]`)?.getAttribute(sourceAttribute)
    return {
      selector: layer.selector,
      zIndex: layer.zIndex,
      reason: layer.reason ?? 'none',
      source: sourceValue ? parseSourceAttribute(sourceValue, element?.getAttribute(sourceAttribute) !== null) : undefined
    }
  }

  /** 0: role/aria-modal/popover 로 팝업임을 밝힌 요소, 1: 위치와 z-index 만 근거인 요소, undefined: 후보 아님 */
  const popupRank = (element: HTMLElement, style: CSSStyleDeclaration): 0 | 1 | undefined => {
    if (style.display === 'none' || style.visibility !== 'visible' || style.pointerEvents === 'none') return undefined
    if (Number(style.opacity) === 0 || element.closest('[data-ia-ignore]') || SKIPPED_TAGS.has(element.tagName.toLowerCase())) return undefined
    if (element.closest('svg') !== null) return undefined
    const role = element.getAttribute('role') ?? ''
    if (element.matches(POPUP_SELECTOR) || POPUP_ROLES.has(role)) return 0
    // z-index 가 음수이면 부모 뒤에 두려는 장식이므로 가려져도 결함이 아니다
    return (style.position === 'absolute' || style.position === 'fixed') && style.zIndex !== 'auto' && Number(style.zIndex) >= 0 ? 1 : undefined
  }

  /** 모달 레이어(dialog, aria-modal, 뷰포트를 덮는 fixed 백드롭) 안의 요소인지. 있으면 그 최상위를 반환한다 */
  const modalLayerOf = (element: Element): Element | undefined => {
    let found: Element | undefined
    for (let current: Element | null = element; current && current !== document.body; current = current.parentElement) {
      const style = styleOf(current)
      const rect = current.getBoundingClientRect()
      const coversViewport = style.position === 'fixed' && rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.9
      if (current.matches(MODAL_LAYER_SELECTOR) || coversViewport) found = current
    }
    return found
  }

  /**
   * 요소를 잘라내는 조상. 일반 흐름이면 모든 조상이, absolute 이면 containing block 이상의 조상만 자른다.
   * shortcut: fixed 요소는 transform 이 있는 조상에 갇히는 경우를 무시한다(자르는 조상 없음으로 본다), 필요하면 containing block 계산을 추가
   */
  const clippingAncestor = (element: Element, rect: DOMRect): Element | undefined => {
    const position = styleOf(element).position
    if (position === 'fixed') return undefined
    let reachedContainingBlock = position !== 'absolute'
    for (let current = element.parentElement; current && current !== document.body && current !== root; current = current.parentElement) {
      const style = styleOf(current)
      if (!reachedContainingBlock) {
        if (style.position === 'static') continue
        reachedContainingBlock = true
      }
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const bounds = current.getBoundingClientRect()
      if (rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1 || rect.left < bounds.left - 1 || rect.top < bounds.top - 1) return current
    }
    return undefined
  }

  /** 중심 + 네 모서리(안쪽으로 인셋) 중 뷰포트 안에 있는 점 */
  const samplePoints = (rect: DOMRect): number[][] => {
    const inset = Math.min(4, rect.width / 4, rect.height / 4)
    return [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + inset, rect.top + inset],
      [rect.right - inset, rect.top + inset],
      [rect.left + inset, rect.bottom - inset],
      [rect.right - inset, rect.bottom - inset]
    ].filter(([x = -1, y = -1]): boolean => x >= 0 && y >= 0 && x < viewport.width && y < viewport.height)
  }

  const detectOcclusions = (): OcclusionDefect[] => {
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    try {
      return collectOcclusions()
    } finally {
      window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' })
    }
  }

  const collectOcclusions = (): OcclusionDefect[] => {
    const found: Array<{ element: HTMLElement; defect: OcclusionDefect }> = []
    // 팝업 포털은 문서 끝에 붙는 일이 많으므로, 앞쪽 장식이 상한을 채우지 못하게 의미 있는 후보를 먼저 둔다 (같은 순위는 문서 순서 유지)
    const candidates = elements
      .flatMap((element): Array<{ element: HTMLElement; rank: 0 | 1 }> => {
        const rank = element.parentElement ? popupRank(element, styleOf(element)) : undefined
        if (rank === undefined) return []
        const box = element.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return []
        if (rank === 1 && (box.width < MIN_POSITIONED_CANDIDATE_PX || box.height < MIN_POSITIONED_CANDIDATE_PX)) return []
        return [{ element, rank }]
      })
      .sort((a, b): number => a.rank - b.rank)
      .slice(0, MAX_OCCLUSION_CANDIDATES)
    for (const { element } of candidates) {
      const parent = element.parentElement
      if (!parent) continue
      let rect = element.getBoundingClientRect()

      let points = samplePoints(rect)
      if (points.length < MIN_SAMPLED_POINTS) {
        // elementFromPoint 는 뷰포트 안에서만 동작하므로 화면 밖 팝업은 위쪽에 맞춰 스크롤해 다시 잰다 (끝나면 원위치)
        window.scrollTo({ top: window.scrollY + rect.top - 16, left: window.scrollX, behavior: 'instant' })
        rect = element.getBoundingClientRect()
        points = samplePoints(rect)
      }
      if (points.length < MIN_SAMPLED_POINTS) continue

      const covered = points
        .map(([x = 0, y = 0]) => ({ x, y, top: document.elementFromPoint(x, y) }))
        .filter((hit): hit is { x: number; y: number; top: Element } => hit.top !== null && hit.top !== element && !element.contains(hit.top))
      const coveredRatio = covered.length / points.length
      const occluder = covered[0]?.top
      if (!occluder || coveredRatio < minCoveredRatio) continue

      // 모달이 페이지를 덮는 것은 정상이다 (모달 안의 요소끼리 가리는 경우만 결함)
      const modal = modalLayerOf(occluder)
      if (modal && !modal.contains(element)) continue

      const clipper = clippingAncestor(element, rect)
      const clipperBounds = clipper?.getBoundingClientRect()
      const clippedOnly =
        clipper !== undefined &&
        clipperBounds !== undefined &&
        covered.every(({ x, y }): boolean => x < clipperBounds.left || x >= clipperBounds.right || y < clipperBounds.top || y >= clipperBounds.bottom)

      const nodeChain = chainOf(element)
      const occluderChain = chainOf(occluder)
      // 가린 요소가 자기 조상이면 겹침이 아니라 자체 배경이므로 잘림이 원인일 때만 본다
      if (!clippedOnly && occluder.contains(element)) continue
      const comparison = compareStacking(nodeChain, occluderChain)

      let cause: OcclusionMetrics['cause'] = 'unknown'
      if (clippedOnly) cause = 'overflow-clip'
      else if (!comparison.nodeAbove) cause = comparison.trapped ? 'stacking-context' : 'z-index'

      const metrics: OcclusionMetrics = {
        kind: 'occluded',
        coveredRatio: round(coveredRatio),
        sampledPoints: points.length,
        occluder: snapshot(occluder),
        nodeLayer: toStackingLayer(comparison.nodeRep),
        occluderLayer: toStackingLayer(comparison.occluderRep),
        cause,
        clippedBy:
          clippedOnly && clipper
            ? {
                selector: buildSelector(clipper),
                overflow: styleOf(clipper).overflowX !== 'visible' ? styleOf(clipper).overflowX : styleOf(clipper).overflowY,
                source: snapshot(clipper).source
              }
            : undefined
      }
      const node = snapshot(element)
      const fingerprint = createFingerprint('occluded', node.source, node.selector, viewport.width)
      const interactive = element.matches(INTERACTIVE_SELECTOR) || element.querySelector(INTERACTIVE_SELECTOR) !== null
      found.push({
        element,
        defect: {
          id: createDefectId(url, fingerprint),
          fingerprint,
          kind: 'occluded',
          severity: classifyOcclusionSeverity(coveredRatio, interactive),
          url,
          viewport,
          node,
          parent: snapshot(parent),
          metrics,
          suggestions: diagnoseOcclusion(node, metrics),
          detectedAt
        }
      })
    }
    // 팝업이 가려지면 그 안의 자식도 같이 가려지므로 가장 바깥 요소만 남긴다. 같은 소스에서 나온 중복(v-for)도 하나로 줄인다
    const seen = new Set<string>()
    return found
      .filter(({ element }): boolean => !found.some((other): boolean => other.element !== element && other.element.contains(element)))
      .map(({ defect }): OcclusionDefect => defect)
      .filter((defect): boolean => {
        if (seen.has(defect.fingerprint)) return false
        seen.add(defect.fingerprint)
        return true
      })
  }

  const defects: Defect[] = [...overflowDefects, ...detectOcclusions()].slice(0, maxDefects)

  return {
    url,
    viewport,
    documentOverflowPx,
    defects,
    stats: { scannedNodes: elements.length, durationMs: round(performance.now() - startedAt) }
  }
}
