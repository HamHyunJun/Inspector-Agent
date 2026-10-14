import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 레이아웃 빈틈 두 가지: 내용은 위쪽에 조금뿐인데 상자만 큰 빈 영역, 같은 크기 항목이 줄바꿈되어 마지막 줄에 하나만 외톨이로 남는 줄.
 * 둘 다 의도일 수 있어 심각도는 낮게(low) 보고하고, 의도된 가운데 정렬·히어로 영역은 제외한다.
 */

const MIN_BOX_HEIGHT_PX = 160
/** 내용 아래 빈 공간이 이 높이(px) 이상이고 */
const MIN_GAP_PX = 120
/** 상자 높이의 이 비율 이상이어야 한다 */
const MIN_GAP_RATIO = 0.5
/** 외톨이를 판정할 최소 항목 수 */
const MIN_WRAPPED_ITEMS = 4
const CENTERING = /center|space-|end/
const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'flow-root'])

/** 내용 아래 빈 공간(px). 기준에 못 미치면 0 */
export const emptyGapPx = (boxHeight: number, contentBottomOffset: number): number => {
  const gap = boxHeight - contentBottomOffset
  return boxHeight >= MIN_BOX_HEIGHT_PX && gap >= MIN_GAP_PX && gap / boxHeight >= MIN_GAP_RATIO ? gap : 0
}

/** 줄별 항목 수와 항목 너비로 "같은 크기 항목이 N,N,..,1 로 줄바꿈됐는지" 본다 */
export const hasLonelyLastItem = (rowCounts: number[], itemWidths: number[]): boolean => {
  if (rowCounts.length < 2 || rowCounts[rowCounts.length - 1] !== 1) return false
  const rest = rowCounts.slice(0, -1)
  if (rest.some((count): boolean => count !== rest[0] || count < 2)) return false
  return Math.max(...itemWidths) - Math.min(...itemWidths) <= 2
}

export const detectLayoutGaps = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const findings: Finding[] = []

  for (const element of elements) {
    const style = styleOf(element)
    if (!BLOCK_DISPLAYS.has(style.display) || element.childElementCount === 0 || !isRendered(element, styleOf)) continue
    const rect = element.getBoundingClientRect()
    const children = Array.from(element.children).filter((child): boolean => {
      const childStyle = styleOf(child)
      return childStyle.position !== 'absolute' && childStyle.position !== 'fixed' && isRendered(child, styleOf)
    })
    if (children.length === 0) continue

    // 1) 빈 영역
    const tag = element.tagName.toLowerCase()
    const isPageShell = tag === 'main' || element.parentElement === document.body || element.parentElement?.id === 'app' || rect.height >= viewport.height * 0.9
    const centered = (style.display === 'flex' || style.display === 'grid') && (CENTERING.test(style.justifyContent) || CENTERING.test(style.alignItems) || CENTERING.test(style.alignContent))
    // 위치를 지정해 다른 요소 위에 얹는 패널·막대, 배경 이미지, 스크롤 영역은 빈 공간이 의도일 수 있다
    const decorated = style.backgroundImage !== 'none' || style.overflowY !== 'visible' || style.position !== 'static'
    // 팝업·배지처럼 절대/고정 위치 자손이 빈 공간을 쓰는 상자는 의도된 구조다
    const usesSpace = Array.from(element.querySelectorAll('*')).some((descendant): boolean => ['absolute', 'fixed'].includes(styleOf(descendant).position))
    if (!isPageShell && !centered && !decorated && !usesSpace && !children.some((child): boolean => styleOf(child).marginTop === 'auto')) {
      const contentBottom = Math.max(...children.map((child): number => child.getBoundingClientRect().bottom))
      const gap = emptyGapPx(rect.height, contentBottom - rect.top)
      if (gap > 0) {
        findings.push({
          element,
          mode: 'empty-space',
          px: gap,
          severity: 'low',
          detail: `상자 높이 ${Math.round(rect.height)}px 중 내용 아래 ${Math.round(gap)}px 가 비어 있음`,
          suggestions: [{ hint: 'empty-space', target: 'node', declarations: { height: 'auto', 'min-height': '0' }, reason: `상자(${Math.round(rect.height)}px) 안에 내용 아래로 ${Math.round(gap)}px 빈 공간이 있습니다. 고정 height/min-height 가 남아 있는지 확인하고, 의도라면 내용을 가운데 정렬하세요.` }]
        })
      }
    }

    // 2) 외톨이 줄바꿈: 같은 크기 항목이 줄바꿈되어 마지막 줄에 하나만 남음
    if (style.display === 'flex' && style.flexWrap === 'wrap' && children.length >= MIN_WRAPPED_ITEMS) {
      const rows: number[] = []
      let lastTop = Number.NaN
      for (const child of children) {
        const top = child.getBoundingClientRect().top
        if (Number.isNaN(lastTop) || Math.abs(top - lastTop) > 2) rows.push(0)
        rows[rows.length - 1]!++
        lastTop = top
      }
      const widths = children.map((child): number => child.getBoundingClientRect().width)
      if (hasLonelyLastItem(rows, widths)) {
        findings.push({
          element,
          mode: 'lonely-wrap',
          px: widths[0]!,
          severity: 'low',
          detail: `같은 크기 항목 ${children.length}개가 ${rows.join('+')} 로 줄바꿈되어 마지막 줄에 하나만 외톨이로 남음`,
          suggestions: [{ hint: 'lonely-wrap-item', target: 'node', declarations: {}, reason: `항목이 ${rows.join('+')} 로 나뉘어 마지막 줄에 하나만 남습니다. 항목 너비를 줄 수에 맞게(예: 2열이면 calc(50% - gap/2)) 조정하거나 grid 로 바꾸세요.` }]
        })
      }
    }
  }
  return toDefects(context, findings)
}
