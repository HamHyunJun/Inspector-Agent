import { buildSelector } from './dom-utils'
import { toDefects } from './rules/finding'
import type { Finding } from './rules/finding'
import { createRuleContext } from './rules/rule-context'
import type { DetectOptions, OverflowDefect } from './types'

/**
 * Tab 탐침의 브라우저 쪽 절반. Tab 키는 verifier(Playwright)가 실제 키보드로 누르고,
 * 여기서는 포커스가 멈춘 요소마다 "포커스 표시가 있는가, 고정 요소에 가려졌는가, 화면 순서를 거슬러 이동했는가"를 기록한 뒤 한꺼번에 결함으로 만든다.
 * 포커스 이동과 스크롤은 브라우저가 계산하므로 DOM 수치만으로는 판정할 수 없다.
 */

const MAX_STOPS = 60
/** 포커스된 요소의 이 비율 이상을 고정 요소가 덮으면 가려진 것이다 */
const MIN_COVER_RATIO = 0.5
/** 화면 위쪽으로 이만큼(px) 되돌아가고 같은 열이면 순서가 어긋난 것이다 */
const ORDER_JUMP_PX = 200
const SAME_COLUMN_PX = 150
const MIN_STOP_PX = 8

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Stop {
  element: HTMLElement
  /** 문서 기준 좌표(스크롤과 무관하게 순서를 비교하기 위함) */
  page: Box
  focused: string
  outlineVisible: boolean
  blurred?: string
  covers: Array<{ layer: HTMLElement; px: number }>
}

let stops: Stop[] = []
let layers: HTMLElement[] = []
let probeStyle: HTMLStyleElement | undefined
let startScroll = { x: 0, y: 0 }

/** 포커스 표시가 될 수 있는 시각 속성을 한 문자열로 모은다(전후 비교용). 보이지 않는 outline(none, 0px)은 색만 달라져도 표시가 아니므로 뺀다 */
const indicatorOf = (element: HTMLElement): string => {
  const s = getComputedStyle(element)
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? [s.outlineStyle, s.outlineWidth, s.outlineColor] : []
  return [...outline, s.boxShadow, s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor, s.backgroundColor, s.color, s.textDecorationLine, s.filter, s.transform].join('|')
}

const outlineVisible = (element: HTMLElement): boolean => {
  const s = getComputedStyle(element)
  return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
}

const isVisuallyHidden = (element: HTMLElement, rect: DOMRect): boolean => {
  const s = getComputedStyle(element)
  return rect.width < MIN_STOP_PX || rect.height < MIN_STOP_PX || Number(s.opacity) === 0 || s.visibility === 'hidden'
}

const areaOf = (box: Box): number => Math.max(box.right - box.left, 0) * Math.max(box.bottom - box.top, 0)

const intersection = (a: Box, b: Box): Box => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })

export const beginTabProbe = (): void => {
  stops = []
  startScroll = { x: window.scrollX, y: window.scrollY }
  // 전환(transition) 중간값을 읽어 포커스 표시를 놓치지 않도록 탐침 동안 애니메이션을 끈다
  probeStyle = document.createElement('style')
  probeStyle.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'
  document.head.appendChild(probeStyle)
  // 화면에 붙어 따라다니는 요소(고정/sticky)만 가림 후보다
  layers = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((element): boolean => {
    const s = getComputedStyle(element)
    return (s.position === 'fixed' || s.position === 'sticky') && s.pointerEvents !== 'none' && s.display !== 'none' && s.visibility !== 'hidden' && element.closest('dialog, [role="dialog"], [aria-modal="true"]') === null
  }).slice(0, 30)
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
}

/** Tab 한 번 누른 뒤 호출한다. 포커스가 문서를 한 바퀴 돌았거나 상한에 닿으면 done */
export const recordTabStop = (): { done: boolean } => {
  const active = document.activeElement
  const previous = stops[stops.length - 1]
  if (previous && previous.element !== active) previous.blurred = indicatorOf(previous.element)
  if (!(active instanceof HTMLElement) || active === document.body || active === document.documentElement) return { done: true }
  if (stops.some((stop): boolean => stop.element === active)) return { done: true }

  const rect = active.getBoundingClientRect()
  const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  const covers: Stop['covers'] = []
  if (!isVisuallyHidden(active, rect)) {
    for (const layer of layers) {
      if (layer.contains(active) || active.contains(layer)) continue
      const overlap = intersection(box, layer.getBoundingClientRect())
      if (areaOf(overlap) / Math.max(areaOf(box), 1) >= MIN_COVER_RATIO) covers.push({ layer, px: Math.min(overlap.right - overlap.left, overlap.bottom - overlap.top) })
    }
  }
  stops.push({
    element: active,
    page: { left: rect.left + window.scrollX, top: rect.top + window.scrollY, right: rect.right + window.scrollX, bottom: rect.bottom + window.scrollY },
    focused: indicatorOf(active),
    outlineVisible: outlineVisible(active),
    covers
  })
  return { done: stops.length >= MAX_STOPS }
}

const describe = (element: Element): string => buildSelector(element).split(' > ').slice(-1)[0] ?? element.tagName.toLowerCase()

/** 기록한 정류장들을 결함으로 만들고 탐침이 바꾼 상태(포커스, 스크롤, 스타일)를 되돌린다 */
export const finishTabProbe = (options: Pick<DetectOptions, 'sourceAttribute'> = {}): OverflowDefect[] => {
  const last = stops[stops.length - 1]
  if (last) {
    last.element.blur()
    last.blurred = indicatorOf(last.element)
  }
  const context = createRuleContext(options.sourceAttribute)
  const findings: Finding[] = []

  // 1) 포커스 표시 없음: 포커스 전후 시각 속성이 같고 outline 도 없다. 눈에 안 보이는 입력(커스텀 체크박스 등)은 제외한다
  for (const stop of stops) {
    if (stop.outlineVisible || stop.blurred === undefined || stop.focused !== stop.blurred) continue
    if (isVisuallyHidden(stop.element, stop.element.getBoundingClientRect()) || stop.element.closest('[data-ia-ignore]') !== null) continue
    findings.push({
      element: stop.element,
      mode: 'focus-ring-missing',
      px: 1,
      detail: `Tab 으로 포커스가 와도 눈에 보이는 표시(outline, 테두리·배경 변화)가 없음`,
      suggestions: [{ hint: 'focus-indicator', target: 'node', declarations: {}, reason: 'outline: none 만 쓰고 대체 표시가 없어 키보드 사용자가 현재 위치를 알 수 없습니다. :focus-visible { outline: 2px solid currentColor; outline-offset: 2px } 처럼 포커스 스타일을 추가하세요(항상 보이게 하는 선언이 아니라 :focus-visible 규칙이어야 합니다).' }]
    })
  }

  // 2) 고정 요소가 포커스된 요소를 가림: 가린 요소(고정 레이어)마다 하나, 가린 개수와 예시를 싣는다
  const coveredBy = new Map<HTMLElement, { count: number; px: number; example: HTMLElement }>()
  for (const stop of stops) {
    for (const cover of stop.covers) {
      const current = coveredBy.get(cover.layer)
      coveredBy.set(cover.layer, { count: (current?.count ?? 0) + 1, px: Math.max(current?.px ?? 0, cover.px), example: current?.example ?? stop.element })
    }
  }
  for (const [layer, info] of coveredBy) {
    const height = Math.round(layer.getBoundingClientRect().height)
    findings.push({
      element: layer,
      mode: 'focus-covered',
      px: info.px,
      detail: `화면에 고정된 요소가 Tab 으로 이동한 ${info.count}개 요소(예: ${describe(info.example)})를 가림`,
      suggestions: [{ hint: 'focus-scroll-padding', target: 'ancestor', declarations: { 'scroll-padding-top': `${height}px` }, reason: `고정 요소(높이 ${height}px)가 포커스된 요소를 덮습니다. 위쪽 바라면 html 에 scroll-padding-top: ${height}px 를, 아래쪽 바라면 scroll-padding-bottom 을 주어 포커스 이동 시 가려지지 않게 하세요.` }]
    })
  }

  // 3) 화면 순서를 거스른 Tab 이동: 고정/sticky 요소를 뺀 정류장에서 같은 열의 위쪽으로 크게 되돌아감
  const flow = stops.filter((stop): boolean => !layers.some((layer): boolean => layer === stop.element || layer.contains(stop.element)))
  for (let index = 1; index < flow.length; index++) {
    const before = flow[index - 1]!
    const current = flow[index]!
    if (before.page.top - current.page.top >= ORDER_JUMP_PX && Math.abs(before.page.left - current.page.left) <= SAME_COLUMN_PX) {
      findings.push({
        element: current.element,
        mode: 'focus-order',
        px: before.page.top - current.page.top,
        detail: `Tab 순서가 ${describe(before.element)} 다음에 화면 위쪽 ${Math.round(before.page.top - current.page.top)}px 로 되돌아감(DOM 순서와 화면 순서가 다름)`,
        suggestions: [{ hint: 'focus-order', target: 'node', declarations: {}, reason: 'CSS order, 절대 위치, flex 방향 반전으로 화면 순서와 DOM 순서가 달라졌습니다. DOM 순서를 화면 순서에 맞추거나 order 를 쓰지 마세요(tabindex 양수로 고치지 마세요).' }]
      })
    }
  }

  const defects = toDefects(context, findings)
  probeStyle?.remove()
  probeStyle = undefined
  stops = []
  layers = []
  window.scrollTo({ left: startScroll.x, top: startScroll.y, behavior: 'instant' })
  return defects
}
