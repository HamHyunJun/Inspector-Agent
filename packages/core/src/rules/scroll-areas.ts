import { buildSelector } from '../dom-utils'
import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 스크롤 영역 세 가지: overflow: hidden 이 모서리의 배지·그림자를 반쯤 잘라 먹는 경우, 가로 스크롤 목록의 끝에 여백이 없어 마지막 카드가 가장자리에 붙는 경우,
 * 페이지도 스크롤되는데 화면 대부분을 차지하는 안쪽 영역이 또 스크롤되는 이중 스크롤.
 */

const MIN_CLIP_PX = 4
const MIN_BADGE_PX = 8
const MAX_BADGE_PX = 80
/** 앞쪽 여백이 이만큼(px) 이상인데 끝 여백이 거의 없으면 비대칭이다 */
export const MIN_LEADING_GAP_PX = 8
const MAX_TRAILING_GAP_PX = 2
/** 안쪽 스크롤 영역이 화면 높이의 이 비율 이상이면 이중 스크롤이다 */
export const NESTED_SCROLL_RATIO = 0.6

/** 목록 앞뒤 여백이 비대칭인 양(px). 대칭이거나 앞 여백이 작으면 0 */
export const scrollEndGapPx = (leading: number, trailing: number): number => (leading >= MIN_LEADING_GAP_PX && trailing <= MAX_TRAILING_GAP_PX ? leading - trailing : 0)

/** 페이지도 스크롤되는데 안쪽 스크롤 영역이 화면 대부분을 차지하는지 */
export const isNestedScroll = (areaHeight: number, viewportHeight: number, pageScrollable: boolean): boolean => pageScrollable && areaHeight >= viewportHeight * NESTED_SCROLL_RATIO

export const detectScrollAreas = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const findings: Finding[] = []
  const root = document.documentElement
  const pageScrollable = root.scrollHeight - root.clientHeight > 4

  for (const element of elements) {
    const style = styleOf(element)
    if (!isRendered(element, styleOf)) continue

    // 1) 모서리 잘림: overflow hidden/clip 상자 밖으로 반쯤 걸친 절대 위치 배지
    if (style.overflowX === 'hidden' || style.overflowX === 'clip' || style.overflowY === 'hidden' || style.overflowY === 'clip') {
      const box = element.getBoundingClientRect()
      for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
        const childStyle = styleOf(child)
        if (childStyle.position !== 'absolute' || childStyle.transform !== 'none' || !isRendered(child, styleOf)) continue
        const rect = child.getBoundingClientRect()
        if (rect.width < MIN_BADGE_PX || rect.height < MIN_BADGE_PX || rect.width > MAX_BADGE_PX || rect.height > MAX_BADGE_PX) continue
        // 가장 가까운 overflow 상자가 element 인 자손만(중간에 다른 잘림 상자가 있으면 그쪽의 몫)
        let nearest: Element | null = child.parentElement
        while (nearest && nearest !== element && styleOf(nearest).overflowX === 'visible' && styleOf(nearest).overflowY === 'visible') nearest = nearest.parentElement
        if (nearest !== element) continue
        const outside = Math.max(box.left - rect.left, rect.right - box.right, box.top - rect.top, rect.bottom - box.bottom)
        const visibleW = Math.min(rect.right, box.right) - Math.max(rect.left, box.left)
        const visibleH = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top)
        const visibleRatio = (Math.max(visibleW, 0) * Math.max(visibleH, 0)) / (rect.width * rect.height)
        if (outside >= MIN_CLIP_PX && visibleRatio >= 0.2 && visibleRatio < 0.98) {
          findings.push({
            element: child,
            mode: 'corner-clipped',
            px: outside,
            detail: `배지·장식(${buildSelector(child).split(' > ').slice(-1)[0]})이 부모의 overflow(${style.overflowX})에 ${Math.round(outside)}px 잘려 일부만 보임`,
            suggestions: [{ hint: 'overflow-visible-parent', target: 'parent', declarations: { overflow: 'visible' }, reason: `절대 위치 배지가 부모(${buildSelector(element).split(' > ').slice(-1)[0]})의 overflow: ${style.overflowX} 에 잘립니다. 배지를 안쪽으로 옮기거나 부모의 overflow 를 visible 로 바꾸세요(둥근 모서리 이미지 자르기가 목적이면 그 이미지에만 overflow 를 주세요).` }]
          })
        }
      }
    }

    // 2) 가로 스크롤 목록 끝 여백 없음: 앞쪽 여백은 있는데 마지막 항목이 스크롤 끝에 붙음
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth - element.clientWidth > 4 && element.children.length >= 2) {
      const box = element.getBoundingClientRect()
      const first = element.firstElementChild!.getBoundingClientRect()
      const last = element.lastElementChild!.getBoundingClientRect()
      const leading = first.left - box.left - parseFloat(style.borderLeftWidth) + element.scrollLeft
      const trailing = element.scrollWidth - (last.right - box.left - parseFloat(style.borderLeftWidth) + element.scrollLeft)
      const gap = scrollEndGapPx(leading, trailing)
      if (gap > 0) {
        findings.push({
          element,
          mode: 'scroll-end-flush',
          px: gap,
          severity: 'low',
          detail: `가로 스크롤 목록의 앞쪽 여백은 ${Math.round(leading)}px 인데 끝 여백이 ${Math.round(Math.max(trailing, 0))}px 라 마지막 항목이 가장자리에 붙음`,
          suggestions: [{ hint: 'scroll-end-padding', target: 'node', declarations: { 'padding-right': `${Math.round(leading)}px` }, reason: `목록 앞쪽에는 ${Math.round(leading)}px 여백이 있는데 끝에는 없어 마지막 카드가 화면 가장자리에 붙습니다. padding-right(또는 마지막 항목의 margin-right)를 같게 주세요.` }]
        })
      }
    }

    // 3) 이중 스크롤: 페이지도 스크롤되는데 화면 대부분을 차지하는 안쪽 영역이 따로 스크롤됨
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight - element.clientHeight > 4 && element.closest('dialog, [role="dialog"], [aria-modal="true"]') === null) {
      if (isNestedScroll(element.clientHeight, viewport.height, pageScrollable)) {
        findings.push({
          element,
          mode: 'nested-scroll',
          px: Math.round(element.clientHeight),
          severity: 'low',
          detail: `페이지가 스크롤되는데 화면의 ${Math.round((element.clientHeight / viewport.height) * 100)}% 를 차지하는 영역이 또 스크롤되어 이중 스크롤바가 생김`,
          suggestions: [{ hint: 'nested-scroll', target: 'node', declarations: {}, reason: '큰 영역이 페이지와 따로 스크롤되면 휠이 어느 쪽을 움직일지 헷갈리고 스크롤바가 둘 생깁니다. 고정 높이를 없애 페이지 스크롤 하나로 합치거나, 꼭 필요하면 높이를 줄이고 overscroll-behavior: contain 을 주세요.' }]
        })
      }
    }
  }
  return toDefects(context, findings)
}
