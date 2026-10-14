import { buildSelector } from '../dom-utils'
import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 효과 없는 CSS 두 가지: 붙지 않는 sticky(조상의 overflow 가 막음), 위치를 지정하지 않아 소용없는 z-index 로 가려진 요소.
 * 선언은 있는데 화면에서는 아무 일도 안 일어나서 코드를 읽어서는 알 수 없다.
 */

const MIN_BOX_PX = 12
const MIN_OVERLAP_PX = 4
const MIN_OVERLAP_RATIO = 0.4
const SCROLLING_OVERFLOWS = new Set(['hidden', 'auto', 'scroll'])

/** sticky 가 기준으로 삼는 조상이 세로로 스크롤되지 않으면(콘텐츠가 안 넘침) 영원히 붙지 않는다 */
export const stickyNeverSticks = (ancestor: { overflowY: string; scrollHeight: number; clientHeight: number }): boolean =>
  SCROLLING_OVERFLOWS.has(ancestor.overflowY) && ancestor.scrollHeight - ancestor.clientHeight <= 1

/** z-index 를 줬지만 위치가 static 이고 flex/grid 아이템도 아니라 효과가 없는지 */
export const isDeadZIndex = (style: { position: string; zIndex: string }, parentDisplay: string): boolean =>
  style.position === 'static' && style.zIndex !== 'auto' && !/flex|grid/.test(parentDisplay)

const overlapOf = (a: DOMRect, b: DOMRect): number => {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (width < MIN_OVERLAP_PX || height < MIN_OVERLAP_PX) return 0
  return (width * height) / Math.max(Math.min(a.width * a.height, b.width * b.height), 1) >= MIN_OVERLAP_RATIO ? Math.min(width, height) : 0
}

export const detectDeadCss = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf } = context
  const findings: Finding[] = []

  for (const element of elements) {
    const style = styleOf(element)
    if (style.position === 'sticky' && isRendered(element, styleOf) && (style.top !== 'auto' || style.bottom !== 'auto')) {
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const ancestorStyle = styleOf(ancestor)
        if (ancestorStyle.overflowY === 'visible' || ancestorStyle.overflowY === 'clip') continue
        // 가장 가까운 스크롤 컨테이너가 기준이다. 그것이 스크롤되지 않는 것이 원인이다
        if (stickyNeverSticks({ overflowY: ancestorStyle.overflowY, scrollHeight: ancestor.scrollHeight, clientHeight: ancestor.clientHeight })) {
          const fix = ancestorStyle.overflowY === 'hidden' ? 'clip' : 'visible'
          findings.push({
            element,
            mode: 'sticky-inert',
            px: Math.max(element.getBoundingClientRect().height, 1),
            detail: `position: sticky 요소가 붙지 않음: 기준이 되는 조상 ${buildSelector(ancestor)} 의 overflow(${ancestorStyle.overflowY})가 스크롤 컨테이너를 만들지만 스크롤되지 않음`,
            suggestions: [{ hint: 'sticky-container-overflow', target: 'ancestor', declarations: { overflow: fix }, reason: `조상 ${buildSelector(ancestor)} 의 overflow: ${ancestorStyle.overflowY} 때문에 sticky 가 그 조상 안에서만 동작해 붙지 않습니다. overflow 를 ${fix} 로 바꾸면(clip 은 잘라내되 스크롤 컨테이너를 만들지 않음) 페이지 스크롤에 붙습니다.` }]
          })
        }
        break
      }
    }

    if (!element.parentElement || !isDeadZIndex(style, styleOf(element.parentElement).display) || !isRendered(element, styleOf)) continue
    const box = element.getBoundingClientRect()
    if (box.width < MIN_BOX_PX || box.height < MIN_BOX_PX) continue
    // z-index 로 올리려던 요소가 실제로 위치 지정된 다른 요소에 덮일 때만 문제다
    const cover = elements.find((other): boolean => {
      if (other === element || other.contains(element) || element.contains(other)) return false
      if (styleOf(other).position === 'static' || !isRendered(other, styleOf)) return false
      return overlapOf(box, other.getBoundingClientRect()) > 0
    })
    if (!cover) continue
    findings.push({
      element,
      mode: 'z-index-inert',
      px: overlapOf(box, cover.getBoundingClientRect()),
      detail: `z-index: ${style.zIndex} 가 효과 없음: position 이 static 이라 위치 지정된 ${buildSelector(cover)} 에 덮임`,
      suggestions: [{ hint: 'z-index-without-position', target: 'node', declarations: { position: 'relative' }, reason: `z-index 는 position 이 static 이면(flex/grid 아이템 제외) 적용되지 않습니다. position: relative 를 주어야 ${buildSelector(cover)} 위로 올라옵니다.` }]
    })
  }
  return toDefects(context, findings)
}
