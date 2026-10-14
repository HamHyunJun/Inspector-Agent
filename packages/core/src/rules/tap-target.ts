import { classifySeverity, diagnoseTapTarget } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 터치 타겟: 손가락으로 누르는 버튼·링크·입력이 너무 작은데 주변 타겟과도 붙어 있어 잘못 누르기 쉬운 경우.
 * WCAG 2.5.8(AA) 기준을 따른다: 24×24px 보다 작은 타겟은, 그 중심에 24px 원을 그렸을 때 다른 타겟과 닿지 않으면(간격 예외) 통과한다.
 * 문장 속 인라인 링크, 비활성 컨트롤, 브라우저 기본 체크박스·라디오는 기준에서 빠진다.
 */

const MIN_TARGET_PX = 24
/** shortcut: 터치 중심 화면(이 너비 이하)에서만 본다. 마우스 전용 데스크톱의 작은 아이콘 버튼까지 잡으면 오탐이 많다, 터치 노트북·태블릿 가로 모드를 다루려면 입력 방식(pointer: coarse)으로 바꾼다 */
const MAX_TOUCH_VIEWPORT_PX = 768
/** 후보가 많은 페이지에서 쌍 비교(제곱)가 폭주하지 않도록 이 개수까지만 본다 */
const MAX_TARGETS = 300
const TARGET_SELECTOR = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"]'
const MODAL_SELECTOR = 'dialog[open], [aria-modal="true"]'
const NATIVE_SIZED_INPUT_TYPES = new Set(['checkbox', 'radio', 'hidden'])

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const width = (box: Box): number => box.right - box.left
const height = (box: Box): number => box.bottom - box.top
const isUndersized = (box: Box): boolean => width(box) < MIN_TARGET_PX || height(box) < MIN_TARGET_PX

/** 작은 타겟이 24px 기준에 모자란 양(px). 크기를 채우면 0 이 된다 */
export const tapShortfallPx = (box: Box): number => Math.max(MIN_TARGET_PX - width(box), MIN_TARGET_PX - height(box), 0)

const circleOf = (box: Box): { x: number; y: number } => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 })

/**
 * 간격 예외 판정: 작은 타겟 중심의 24px 원이 다른 타겟(작은 타겟은 자기 원)과 닿으면 서로 잘못 누르기 쉽다.
 * 닿는 타겟이 있으면 true.
 */
export const crowdsTarget = (box: Box, others: Box[]): boolean => {
  const center = circleOf(box)
  const radius = MIN_TARGET_PX / 2
  return others.some((other): boolean => {
    if (isUndersized(other)) {
      const otherCenter = circleOf(other)
      return Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y) < MIN_TARGET_PX
    }
    const nearestX = Math.max(other.left, Math.min(center.x, other.right))
    const nearestY = Math.max(other.top, Math.min(center.y, other.bottom))
    return Math.hypot(center.x - nearestX, center.y - nearestY) < radius
  })
}

interface Target {
  element: HTMLElement
  box: Box
}

export const detectTapTarget = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  if (viewport.width > MAX_TOUCH_VIEWPORT_PX) return []

  // 열린 모달 밑에 깔린 요소는 지금 누를 수 없으므로 대상이 아니다
  const modalBoxes = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).map((modal): { modal: HTMLElement; box: DOMRect } => ({ modal, box: modal.getBoundingClientRect() }))
  const isUnderModal = (element: Element, box: Box): boolean => {
    const center = circleOf(box)
    return modalBoxes.some(({ modal, box: rect }): boolean => !modal.contains(element) && center.x >= rect.left && center.x <= rect.right && center.y >= rect.top && center.y <= rect.bottom)
  }

  const targets: Target[] = []
  for (const element of elements) {
    if (targets.length >= MAX_TARGETS) break
    if (!element.matches(TARGET_SELECTOR)) continue
    if (element instanceof HTMLInputElement && NATIVE_SIZED_INPUT_TYPES.has(element.type)) continue
    if ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.disabled) continue
    if (element.closest('svg, [data-ia-ignore], [hidden], [inert], [aria-hidden="true"]') !== null) continue
    const style = styleOf(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none' || Number(style.opacity) === 0) continue
    // 문장 속 인라인 링크는 WCAG 가 크기 기준에서 빼 준다
    if (element instanceof HTMLAnchorElement && style.display === 'inline') continue
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    if (isUnderModal(element, box)) continue
    targets.push({ element, box })
  }

  const worst = new Map<string, OverflowDefect>()
  for (const target of targets) {
    if (!isUndersized(target.box)) continue
    const others = targets.filter((other): boolean => other !== target && !target.element.contains(other.element) && !other.element.contains(target.element)).map((other): Box => other.box)
    if (!crowdsTarget(target.box, others)) continue
    const parent = target.element.parentElement
    if (!parent) continue

    const node = snapshot(target.element)
    const fingerprint = createFingerprint('overflow-x:tap-target', node.source, `${node.selector}::tap-target`, viewport.width)
    const shortfall = tapShortfallPx(target.box)
    const current = worst.get(fingerprint)
    if (current && current.metrics.overflowPx >= shortfall) continue
    // parentContentWidth 는 이 모드에서만 기준 크기(24px)를 뜻한다
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'tap-target',
      overflowPx: Math.round(shortfall * 100) / 100,
      overflowRatio: Math.round((shortfall / MIN_TARGET_PX) * 1000) / 1000,
      parentContentWidth: MIN_TARGET_PX,
      nodeWidth: Math.round(Math.min(width(target.box), height(target.box)) * 100) / 100
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
      suggestions: diagnoseTapTarget(node, metrics),
      detectedAt
    })
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
