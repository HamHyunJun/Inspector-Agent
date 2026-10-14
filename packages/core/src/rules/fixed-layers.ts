import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 고정 레이어 두 가지: 화면에 붙어 따라다니는(position: fixed) 요소끼리 겹치는 경우(하단 바와 쿠키 배너, 겹친 떠 있는 버튼),
 * 그리고 화면의 큰 부분을 가리는 경우. 모달·대화상자는 의도적으로 덮으므로 제외한다.
 */

const MIN_BOX_PX = 16
const MIN_OVERLAP_PX = 4
const MIN_OVERLAP_RATIO = 0.4
/** 화면 넓이의 이 비율을 넘게 고정 요소가 차지하면 본문을 가린다 */
export const MAX_FIXED_AREA_RATIO = 0.35
const MODAL_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [popover]'

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** 두 고정 박스의 겹친 정도(px, 겹친 가로·세로 중 작은 쪽). 0 이면 겹치지 않거나 스치기만 함 */
export const fixedOverlapPx = (a: Box, b: Box): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (width < MIN_OVERLAP_PX || height < MIN_OVERLAP_PX) return 0
  const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top))
  return (width * height) / Math.max(smaller, 1) >= MIN_OVERLAP_RATIO ? Math.min(width, height) : 0
}

/** 화면 넓이 대비 고정 요소가 화면 안에서 차지한 비율이 기준을 넘는 양을 높이(px)로 환산. 0 이면 적당함 */
export const fixedHogPx = (box: Box, viewport: { width: number; height: number }): number => {
  const width = Math.max(Math.min(box.right, viewport.width) - Math.max(box.left, 0), 0)
  const height = Math.max(Math.min(box.bottom, viewport.height) - Math.max(box.top, 0), 0)
  const excess = (width * height) / (viewport.width * viewport.height) - MAX_FIXED_AREA_RATIO
  return excess > 0 ? (excess * viewport.width * viewport.height) / Math.max(width, 1) : 0
}

export const detectFixedLayers = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const layers: Array<{ element: HTMLElement; box: Box }> = []
  for (const element of elements) {
    const style = styleOf(element)
    if (style.position !== 'fixed' || style.pointerEvents === 'none' || !isRendered(element, styleOf)) continue
    if (element.closest(MODAL_SELECTOR) !== null) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < MIN_BOX_PX || rect.height < MIN_BOX_PX || rect.right <= 0 || rect.left >= viewport.width) continue
    layers.push({ element, box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } })
  }

  const findings: Finding[] = []
  for (const layer of layers) {
    const hog = fixedHogPx(layer.box, viewport)
    if (hog > 0) {
      findings.push({
        element: layer.element,
        mode: 'fixed-hog',
        px: hog,
        detail: `화면에 고정된 요소가 화면의 ${Math.round(((layer.box.right - layer.box.left) * (layer.box.bottom - layer.box.top) * 100) / (viewport.width * viewport.height))}% 를 차지해 본문을 가림`,
        suggestions: [{ hint: 'fixed-layer-size', target: 'node', declarations: { 'max-height': '30vh', 'overflow-y': 'auto' }, reason: '고정 요소가 화면의 큰 부분을 항상 가립니다. 높이를 줄이거나 max-height 로 제한하고 넘치는 내용은 스크롤시키세요.' }]
      })
    }
  }
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const first = layers[i]!
      const second = layers[j]!
      if (first.element.contains(second.element) || second.element.contains(first.element)) continue
      const px = fixedOverlapPx(first.box, second.box)
      if (px === 0) continue
      findings.push({
        element: second.element,
        mode: 'fixed-overlap',
        px,
        detail: `화면에 고정된 요소가 다른 고정 요소 ${first.element.tagName.toLowerCase()}${first.element.id ? `#${first.element.id}` : first.element.classList[0] ? `.${first.element.classList[0]}` : ''} 와 ${Math.round(px)}px 겹침`,
        suggestions: [{ hint: 'fixed-layer-overlap', target: 'node', declarations: {}, reason: '화면에 고정된 두 요소가 같은 자리를 차지합니다. 한쪽의 bottom/right 오프셋을 조정하거나 한 컨테이너로 묶어 쌓이게 하세요.' }]
      })
    }
  }
  return toDefects(context, findings)
}
