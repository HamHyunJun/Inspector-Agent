import { buildSelector } from '../dom-utils'
import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 상호작용 결함 여섯 가지(페이지 안에서 판정되는 것): 눌러도 반응 없는 버튼(내용 없는 투명 레이어가 가로챔), 클릭만 되고 키보드로는 못 누르는 요소,
 * hover 로만 열리는 메뉴, 모달이 없는데 남은 스크롤 잠금, 로드 중 화면이 튄 정도(CLS), 양수 tabindex.
 * 실제 Tab 키 입력이 필요한 것(포커스 표시, 고정 요소가 포커스를 가림, Tab 순서)은 tab-probe.ts 가 맡는다.
 */

const MAX_CLICK_TARGETS = 60
const MIN_TARGET_PX = 12
const CLICK_TARGET_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]'
const MODAL_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [popover]'
const NATIVE_INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'label', 'option', 'area', 'video', 'audio', 'iframe', 'details', 'html', 'body'])
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'combobox', 'textbox', 'slider', 'searchbox', 'spinbutton'])
const INTERACTIVE_DESCENDANTS = 'a[href], button, input, select, textarea, [tabindex]'
const HIDDEN_REVEAL = /^(display|visibility|opacity|max-height|height|clip|clip-path|transform)$/
/** 누적 레이아웃 이동 점수가 이 값 이상이면 "나쁨"이 아닌 "개선 필요"(Core Web Vitals 기준 0.1) */
export const MIN_LAYOUT_SHIFT = 0.1

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** 스크롤 영역에 잘려 실제로 보이는 부분만 남긴다. 보이는 부분이 너무 작으면 undefined */
const visiblePart = (element: Element, styleOf: (element: Element) => CSSStyleDeclaration): Box | undefined => {
  const rect = element.getBoundingClientRect()
  let box: Box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
    const style = styleOf(ancestor)
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    const clip = ancestor.getBoundingClientRect()
    box = { left: Math.max(box.left, clip.left), top: Math.max(box.top, clip.top), right: Math.min(box.right, clip.right), bottom: Math.min(box.bottom, clip.bottom) }
  }
  return box.right - box.left >= MIN_TARGET_PX && box.bottom - box.top >= MIN_TARGET_PX ? box : undefined
}

/** 한 요소가 키보드 포커스를 받을 수 있는 네이티브/ARIA 상호작용 요소인지(클릭만 되는 가짜 버튼 판정용) */
export const isFakeButton = (info: { tag: string; hasHref: boolean; role: string; hasTabindex: boolean; cursor: string; parentCursor: string; hasContent: boolean }): boolean => {
  if (info.cursor !== 'pointer' || info.parentCursor === 'pointer' || !info.hasContent || info.hasTabindex) return false
  if (INTERACTIVE_ROLES.has(info.role)) return false
  if (info.tag === 'a') return !info.hasHref
  return !NATIVE_INTERACTIVE_TAGS.has(info.tag)
}

/** 문서가 넘쳐 스크롤돼야 하는데 overflow 로 막혔는지(열린 모달이 없을 때만 결함) */
export const isScrollLocked = (info: { overflowY: string; position: string; scrollHeight: number; clientHeight: number; modalOpen: boolean }): boolean =>
  !info.modalOpen && (info.overflowY === 'hidden' || info.overflowY === 'clip' || info.position === 'fixed') && info.scrollHeight - info.clientHeight > 40

interface HoverRule {
  base: string
  rest: string
}

/** 스타일시트에서 ":hover 로 하위 요소를 드러내는" 규칙을 모은다. 다른 출처 시트는 읽을 수 없어 건너뛴다 */
const hoverRules = (): { rules: HoverRule[]; selectors: string } => {
  const rules: HoverRule[] = []
  const all: string[] = []
  const visit = (list: CSSRuleList): void => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        all.push(rule.selectorText)
        const reveals = Array.from(rule.style).some((property): boolean => HIDDEN_REVEAL.test(property))
        if (!reveals) continue
        for (const part of rule.selectorText.split(',')) {
          const index = part.indexOf(':hover')
          if (index < 0) continue
          const rest = part.slice(index + ':hover'.length)
          // 하위/형제 요소를 드러내는 규칙만(자기 색만 바꾸는 hover 는 제외)
          if (/^\s*[\s>+~]\s*\S/.test(rest)) rules.push({ base: part.slice(0, index).trim(), rest })
        }
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules)
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      // 다른 출처 시트
    }
  }
  return { rules, selectors: all.join('\n') }
}

export const detectInteraction = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const findings: Finding[] = []
  const root = document.documentElement
  // 화면을 실제로 덮는 모달만 센다: showModal() 로 연 것, 또는 화면 넓이의 25% 이상을 덮는 고정 요소(작은 인라인 대화상자는 제외)
  const isRealModal = (modal: HTMLElement): boolean => {
    try {
      if (modal.matches(':modal')) return true
    } catch {
      // :modal 을 모르는 브라우저
    }
    const rect = modal.getBoundingClientRect()
    return styleOf(modal).position === 'fixed' && rect.width * rect.height >= viewport.width * viewport.height * 0.25
  }
  const modalOpen = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).some((modal): boolean => isRendered(modal, styleOf) && isRealModal(modal))

  // 1) 눌러도 반응 없는 버튼: 보이는 부분 중심을 elementFromPoint 로 찍어 다른 요소가 받는지 본다
  const startScroll = { x: window.scrollX, y: window.scrollY }
  let tested = 0
  try {
    for (const element of elements) {
      if (tested >= MAX_CLICK_TARGETS) break
      // 대화상자 안 버튼이 가려지는 것은 가려짐 규칙의 몫이다
      if (!element.matches(CLICK_TARGET_SELECTOR) || element.closest(MODAL_SELECTOR) !== null || (element as HTMLButtonElement).disabled || styleOf(element).pointerEvents === 'none' || !isRendered(element, styleOf)) continue
      if (visiblePart(element, styleOf) === undefined) continue
      tested++
      const first = visiblePart(element, styleOf)!
      window.scrollTo({ left: 0, top: window.scrollY + (first.top + first.bottom) / 2 - viewport.height / 2, behavior: 'instant' })
      const box = visiblePart(element, styleOf)
      if (!box) continue
      const x = (box.left + box.right) / 2
      const y = (box.top + box.bottom) / 2
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue
      const hit = document.elementFromPoint(x, y)
      if (!hit || hit === element || element.contains(hit) || hit.contains(element)) continue
      if (element instanceof HTMLInputElement && element.labels !== null && Array.from(element.labels).some((label): boolean => label.contains(hit))) continue
      const modal = hit.closest(MODAL_SELECTOR)
      if (modal !== null && !modal.contains(element)) continue
      // 글·이미지·컨트롤이 있는 레이어(열린 팝오버, 툴팁, 배너)가 덮는 것은 의도된 겹침이거나 다른 규칙의 몫이다. 내용 없는 투명 레이어만 본다
      if ((hit.textContent ?? '').trim() !== '' || hit.querySelector('img, svg, video, canvas, iframe, input, button, a') !== null) continue
      findings.push({
        element,
        mode: 'click-blocked',
        px: Math.min(box.right - box.left, box.bottom - box.top),
        detail: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} 의 중심을 ${buildSelector(hit).split(' > ').slice(-1)[0]} 이(가) 가로채 눌러도 반응하지 않음`,
        suggestions: [{ hint: 'click-blocked', target: 'node', declarations: {}, reason: `버튼 중심(${Math.round(x)}, ${Math.round(y)})의 최상단 요소가 ${buildSelector(hit)} 라 클릭이 거기로 갑니다. 그 레이어에 pointer-events: none 을 주거나 z-index/위치를 조정하고, 장식용 오버레이라면 버튼을 덮지 않게 하세요.` }]
      })
    }
  } finally {
    window.scrollTo({ left: startScroll.x, top: startScroll.y, behavior: 'instant' })
  }

  for (const element of elements) {
    const style = styleOf(element)
    const tag = element.tagName.toLowerCase()

    // 2) 클릭만 되는 요소: cursor: pointer 의 출처이고 키보드로 포커스할 수 없다
    const parentStyle = element.parentElement ? styleOf(element.parentElement) : undefined
    const hasContent = (element.textContent ?? '').trim() !== '' || element.querySelector('img, svg') !== null
    if (
      style.cursor === 'pointer' &&
      isFakeButton({ tag, hasHref: element.hasAttribute('href'), role: element.getAttribute('role') ?? '', hasTabindex: element.hasAttribute('tabindex'), cursor: style.cursor, parentCursor: parentStyle?.cursor ?? '', hasContent }) &&
      element.closest('a[href], button, label, summary, [role="button"], [role="link"]') === null &&
      element.querySelector(INTERACTIVE_DESCENDANTS) === null &&
      isRendered(element, styleOf) &&
      element.getBoundingClientRect().width >= MIN_TARGET_PX
    ) {
      findings.push({
        element,
        mode: 'fake-button',
        px: 1,
        detail: `${tag} 가 cursor: pointer 로 클릭 가능해 보이지만 키보드로 포커스할 수 없음(button/a 가 아님, tabindex 없음)`,
        suggestions: [{ hint: 'fake-button', target: 'node', declarations: {}, reason: '클릭 가능한 요소가 div/span 이라 Tab 으로 닿지 않고 스크린 리더도 버튼으로 읽지 않습니다. <button>(또는 <a href>)으로 바꾸세요. 불가능하면 role="button" tabindex="0" 과 Enter/Space 키 처리를 추가하세요.' }]
      })
    }

    // 3) 양수 tabindex: 문서 순서와 무관하게 Tab 순서를 앞당겨 순서를 망친다
    const tabindex = Number.parseInt(element.getAttribute('tabindex') ?? '', 10)
    if (tabindex > 0 && isRendered(element, styleOf)) {
      findings.push({
        element,
        mode: 'tabindex-positive',
        px: tabindex,
        detail: `tabindex="${tabindex}" 가 Tab 순서를 문서 순서보다 앞당김`,
        suggestions: [{ hint: 'tabindex-positive', target: 'node', declarations: {}, reason: '양수 tabindex 는 페이지 전체의 Tab 순서를 깨뜨립니다. tabindex 를 제거(0 또는 생략)하고 DOM 순서를 화면 순서에 맞추세요.' }]
      })
    }
  }

  // 4) 스크롤 잠금 남음
  const lockedBy = [document.body, root].find((target): boolean => {
    const style = styleOf(target)
    return isScrollLocked({ overflowY: style.overflowY, position: target === document.body ? style.position : 'static', scrollHeight: root.scrollHeight, clientHeight: root.clientHeight, modalOpen })
  })
  if (lockedBy) {
    const gap = root.scrollHeight - root.clientHeight
    findings.push({
      element: lockedBy,
      mode: 'scroll-locked',
      px: gap,
      detail: `문서가 ${root.scrollHeight}px 인데 ${lockedBy.tagName.toLowerCase()} 의 overflow(또는 position: fixed)로 스크롤이 막혀 ${gap}px 를 볼 수 없음(열린 모달 없음)`,
      suggestions: [{ hint: 'scroll-locked', target: 'node', declarations: { 'overflow-y': 'auto' }, reason: '모달이 없는데 body/html 이 스크롤을 막고 있습니다. 모달을 닫을 때 잠금(overflow: hidden, position: fixed)을 풀지 않았는지 확인하세요.' }]
    })
  }

  // 5) hover 로만 열리는 메뉴: 키보드(:focus-within)와 터치로는 닿지 않는다
  const { rules, selectors } = hoverRules()
  const seen = new Set<Element>()
  for (const rule of rules) {
    let trigger: Element | null = null
    let revealed: Element | null = null
    try {
      trigger = document.querySelector(rule.base)
      revealed = document.querySelector(`${rule.base}${rule.rest}`)
    } catch {
      continue
    }
    if (!trigger || !revealed || seen.has(trigger) || !isRendered(trigger, styleOf) || trigger.hasAttribute('aria-expanded') || trigger.hasAttribute('aria-haspopup')) continue
    const hiddenNow = styleOf(revealed).display === 'none' || styleOf(revealed).visibility === 'hidden' || Number(styleOf(revealed).opacity) === 0
    if (!hiddenNow || (revealed.matches(INTERACTIVE_DESCENDANTS) ? false : revealed.querySelector(INTERACTIVE_DESCENDANTS) === null)) continue
    if (selectors.includes(`${rule.base}:focus-within`) || selectors.includes(`${rule.base}:focus`)) continue
    seen.add(trigger)
    findings.push({
      element: trigger,
      mode: 'hover-only',
      px: 1,
      detail: `${buildSelector(revealed).split(' > ').slice(-1)[0]} 메뉴가 :hover 로만 열려 키보드와 터치로는 열 수 없음`,
      suggestions: [{ hint: 'hover-only-menu', target: 'node', declarations: {}, reason: '메뉴가 CSS :hover 로만 드러나 Tab 이나 터치로는 열리지 않습니다. :focus-within 규칙을 함께 추가하거나 버튼(aria-expanded)으로 여닫게 하세요.' }]
    })
  }

  // 6) 로드 중 화면이 튄 정도(verifier 가 페이지 시작 전에 심은 관찰자의 값을 읽는다)
  const shifts = (window as unknown as { __IA_SHIFTS__?: Array<{ value: number; node: Node | null }> }).__IA_SHIFTS__ ?? []
  const total = shifts.reduce((sum, shift): number => sum + shift.value, 0)
  if (total >= MIN_LAYOUT_SHIFT) {
    const worst = shifts.reduce((best, shift): { value: number; node: Node | null } => (shift.value > best.value ? shift : best), shifts[0]!)
    const node = worst.node instanceof Element && document.body.contains(worst.node) ? worst.node : undefined
    findings.push({
      element: root,
      mode: 'layout-shift',
      px: Math.round(total * 1000) / 10,
      detail: `로드 중 화면이 튀어 누적 레이아웃 이동 점수가 ${Math.round(total * 1000) / 1000}(기준 ${MIN_LAYOUT_SHIFT} 이상은 개선 필요)${node ? `, 가장 크게 움직인 요소 ${buildSelector(node).split(' > ').slice(-1)[0]}` : ''}`,
      suggestions: [{ hint: 'layout-shift', target: 'node', declarations: {}, reason: '이미지·광고·배너·웹폰트가 로드되며 아래 내용을 밀어냈습니다. <img> 에 width/height(또는 aspect-ratio)를 지정하고 늦게 뜨는 영역의 자리를 미리 확보하세요.' }]
    })
  }
  return toDefects(context, findings)
}
