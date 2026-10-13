import { createSnapshotter } from './detector'
import type { FocusState, ModalProbe, ModalTrigger } from './types'

/**
 * 모달 포커스 탐침의 브라우저 쪽 절반. Tab 키 입력은 verifier(Playwright)가 실제 키보드로 누르고,
 * 여기서는 "어떤 모달이 열려 있는가"와 "지금 포커스가 모달 안인가"만 조회한다.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

let probed: HTMLElement[] = []

const isVisible = (element: HTMLElement): boolean => {
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility === 'visible' && element.getClientRects().length > 0
}

const focusableIn = (modal: HTMLElement): HTMLElement[] =>
  Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element): boolean => isVisible(element) && element.closest('[inert]') === null
  )

/**
 * 모달로 보는 기준
 * - aria-modal="true" 또는 role="alertdialog"
 * - role="dialog" 이면서 position: fixed (화면에 띄운 대화상자)
 * 인라인에 놓인 role="dialog" 는 비모달(쿠키 배너, 팝오버)일 수 있어 포커스가 나가도 결함으로 보지 않는다.
 * 네이티브 <dialog>.showModal() 은 브라우저가 포커스를 가두므로 따로 다루지 않는다.
 */
const triggerOf = (element: HTMLElement): ModalTrigger | undefined => {
  if (element.getAttribute('aria-modal') === 'true') return 'aria-modal'
  const role = element.getAttribute('role')
  if (role === 'alertdialog') return 'alertdialog'
  if (role === 'dialog' && getComputedStyle(element).position === 'fixed') return 'fixed-dialog'
  return undefined
}

export const findModals = (options: { sourceAttribute?: string } = {}): ModalProbe[] => {
  const snapshot = createSnapshotter((element): CSSStyleDeclaration => getComputedStyle(element), options.sourceAttribute ?? 'data-ia-src')
  const found = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')).filter(
    (element): boolean =>
      isVisible(element) && element.getAttribute('aria-hidden') !== 'true' && element.closest('[data-ia-ignore]') === null && triggerOf(element) !== undefined
  )
  // 중첩된 경우 가장 바깥 모달만 검사한다
  probed = found.filter((element): boolean => !found.some((other): boolean => other !== element && other.contains(element)))
  return probed.flatMap((element, index): ModalProbe[] => {
    const parent = element.parentElement
    const trigger = triggerOf(element)
    const focusableCount = focusableIn(element).length
    // 포커스 가능한 요소가 없으면 Tab 으로 시험할 수 없다
    return parent && trigger && focusableCount > 0 ? [{ index, trigger, focusableCount, node: snapshot(element), parent: snapshot(parent) }] : []
  })
}

export const focusFirstInModal = (index: number): boolean => {
  const modal = probed[index]
  const first = modal ? focusableIn(modal)[0] : undefined
  first?.focus()
  return first !== undefined && document.activeElement === first
}

export const modalFocusState = (index: number, options: { sourceAttribute?: string } = {}): FocusState => {
  const modal = probed[index]
  const active = document.activeElement
  const inside = modal !== undefined && active !== null && active !== document.body && modal.contains(active)
  if (inside || !active) return { inside }
  const snapshot = createSnapshotter((element): CSSStyleDeclaration => getComputedStyle(element), options.sourceAttribute ?? 'data-ia-src')
  return { inside, active: snapshot(active) }
}
