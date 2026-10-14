import { ownText } from '../dom-utils'
import type { OverflowDefect } from '../types'
import { adjustToContrast, backdropOf, composite, contrastRatio, parseColor, toCss } from './color'
import type { Rgb } from './color'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 눈으로 봐야 아는 시각 품질 여섯 가지: 글자 대비 부족, 입력창 경계 대비 부족, 아이콘·글자 세로 정렬 어긋남과 버튼 안 글자 쏠림,
 * 같은 행 카드 높이 들쭉날쭉, 모바일 주소창을 못 따라가는 100vh, 너무 긴 줄.
 * 색은 배경 이미지·그라디언트가 끼면 판정할 수 없어 건너뛴다(단색 배경만 본다).
 */

/** WCAG 1.4.3 일반 글자 / 큰 글자 기준 */
export const TEXT_CONTRAST = 4.5
export const LARGE_TEXT_CONTRAST = 3
/** WCAG 1.4.11 입력창 경계 기준 */
export const UI_CONTRAST = 3
const MAX_TEXT_ELEMENTS = 400
const MAX_FIELDS = 100
/** 정렬이 이만큼(px) 이상 어긋나면 눈에 띈다 */
export const MIN_MISALIGN_PX = 4
const MAX_ICON_PX = 40
/** 같은 행 카드의 높이 차가 이 이상이고 */
export const MIN_HEIGHT_GAP_PX = 24
/** 가장 큰 카드의 이 비율 이상일 때 */
export const MIN_HEIGHT_GAP_RATIO = 0.2
/** 한 줄이 이 글자 수를 넘으면 읽기 힘들다(권장 45~75자, 100자 초과는 눈이 줄을 놓친다) */
export const MAX_LINE_CHARS = 100
const MIN_LONG_TEXT_CHARS = 150
const TEXT_FIELD_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

/** 큰 글자(24px 이상, 또는 굵은 18.66px 이상)는 완화된 기준을 쓴다 */
export const requiredContrast = (fontPx: number, fontWeight: number): number => (fontPx >= 24 || (fontPx >= 18.66 && fontWeight >= 700) ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST)

/** 같은 행 카드 높이의 차(px). 기준에 못 미치면 0 */
export const heightGapPx = (heights: number[]): number => {
  if (heights.length < 2) return 0
  const max = Math.max(...heights)
  const gap = max - Math.min(...heights)
  return gap >= MIN_HEIGHT_GAP_PX && gap / max >= MIN_HEIGHT_GAP_RATIO ? gap : 0
}

/** 글줄 하나에 평균 몇 글자인지가 기준을 넘는지(긴 글에서만) */
export const isTooLongLine = (charCount: number, lineCount: number): boolean => charCount >= MIN_LONG_TEXT_CHARS && lineCount >= 1 && charCount / lineCount > MAX_LINE_CHARS

const effectiveOpacity = (element: Element, styleOf: (element: Element) => CSSStyleDeclaration): number => {
  let opacity = 1
  for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) opacity *= Number(styleOf(current).opacity)
  return opacity
}

const isBlended = (element: Element, styleOf: (element: Element) => CSSStyleDeclaration): boolean => {
  for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) {
    const style = styleOf(current)
    if (style.mixBlendMode !== 'normal' || (style.filter !== 'none' && style.filter !== '') || style.backgroundClip === 'text') return true
  }
  return false
}

const lineRectsOf = (node: Text): DOMRect[] => {
  const range = document.createRange()
  range.selectNodeContents(node)
  return Array.from(range.getClientRects()).filter((rect): boolean => rect.width > 0)
}

export const detectVisual = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const findings: Finding[] = []
  let textChecked = 0
  let fieldsChecked = 0

  for (const element of elements) {
    const style = styleOf(element)
    const tag = element.tagName.toLowerCase()

    // 1) 입력창 경계 대비: 테두리나 배경이 주변 배경과 3:1 이상으로 구분되어야 한다
    const isField = element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TEXT_FIELD_TYPES.has(element.type))
    if (isField && fieldsChecked < MAX_FIELDS && isRendered(element, styleOf)) {
      fieldsChecked++
      const surround = backdropOf(element, styleOf, false)
      if (surround) {
        const sides = ['top', 'right', 'bottom', 'left']
        const borderColors = sides.filter((side): boolean => parseFloat(style.getPropertyValue(`border-${side}-width`)) >= 1 && style.getPropertyValue(`border-${side}-style`) !== 'none').map((side): number => {
          const color = parseColor(style.getPropertyValue(`border-${side}-color`))
          return color[3] > 0 ? contrastRatio(composite(color, surround), surround) : 1
        })
        const bg = parseColor(style.backgroundColor)
        const bestBorder = Math.max(1, ...borderColors)
        const bgRatio = bg[3] > 0 ? contrastRatio(composite(bg, surround), surround) : 1
        const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== ''
        if (Math.max(bestBorder, bgRatio) < UI_CONTRAST && !hasShadow) {
          const border = parseColor(style.borderTopColor)
          const fixed = adjustToContrast(composite(border, surround), surround, UI_CONTRAST)
          findings.push({
            element,
            mode: 'border-contrast',
            px: UI_CONTRAST - Math.max(bestBorder, bgRatio),
            detail: `입력창 경계(테두리 ${Math.round(bestBorder * 100) / 100}:1, 배경 ${Math.round(bgRatio * 100) / 100}:1)가 주변 배경과 ${UI_CONTRAST}:1 미만이라 칸의 위치가 잘 안 보임`,
            suggestions: [{ hint: 'border-contrast', target: 'node', declarations: { 'border-color': toCss(fixed) }, reason: `입력창 테두리·배경이 주변과 ${UI_CONTRAST}:1 미만이라 구분되지 않습니다(WCAG 1.4.11). 테두리 색을 ${toCss(fixed)} 정도로 진하게 하세요.` }]
          })
        }
      }
    }

    // 2) 글자 대비
    const text = ownText(element)
    if (text !== '' && textChecked < MAX_TEXT_ELEMENTS && isRendered(element, styleOf) && element.closest(':disabled, [aria-disabled="true"], [data-ia-ignore]') === null) {
      textChecked++
      const fg = parseColor(style.color)
      const backdrop = backdropOf(element, styleOf, true)
      const alpha = fg[3] * effectiveOpacity(element, styleOf)
      if (backdrop && alpha > 0.05 && style.webkitTextFillColor !== 'transparent' && !isBlended(element, styleOf)) {
        const shown = composite([fg[0], fg[1], fg[2], alpha], backdrop)
        const ratio = contrastRatio(shown, backdrop)
        const fontPx = parseFloat(style.fontSize)
        const required = requiredContrast(fontPx, Number(style.fontWeight))
        if (ratio < required) {
          const fixed = adjustToContrast(shown, backdrop, required)
          findings.push({
            element,
            mode: 'low-contrast',
            px: required - ratio,
            detail: `글 "${text.slice(0, 20)}" 의 대비가 ${Math.round(ratio * 100) / 100}:1 로 기준 ${required}:1 미만이라 읽기 어려움`,
            suggestions: [{ hint: 'text-contrast', target: 'node', declarations: { color: toCss(fixed), opacity: '1' }, reason: `글자색과 배경의 대비가 ${Math.round(ratio * 100) / 100}:1 입니다(WCAG 1.4.3 기준 ${required}:1). 글자색을 ${toCss(fixed)} 정도로 진하게 하세요(opacity 로 흐리게 만든 글자는 opacity 도 확인).` }]
          })
        }
      }

      // 3) 한 줄이 너무 긴 글
      if (text.length >= MIN_LONG_TEXT_CHARS && tag !== 'pre' && tag !== 'code') {
        const lines = Array.from(element.childNodes).flatMap((child): DOMRect[] => (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '' ? lineRectsOf(child as Text) : []))
        const lineCount = new Set(lines.map((rect): number => Math.round(rect.top / 2))).size
        if (isTooLongLine(text.length, lineCount)) {
          const perLine = Math.round(text.length / lineCount)
          findings.push({
            element,
            mode: 'long-line',
            px: perLine - MAX_LINE_CHARS,
            severity: 'low',
            detail: `한 줄에 평균 ${perLine}글자라 너무 길어 읽다가 줄을 놓치기 쉬움(권장 45~75자)`,
            suggestions: [{ hint: 'line-length', target: 'node', declarations: { 'max-width': '75ch' }, reason: `한 줄이 평균 ${perLine}글자입니다. 본문 폭을 max-width: 75ch 정도로 제한하세요.` }]
          })
        }
      }

      // 4) 버튼 안 글자 쏠림: 글자 하나뿐인 버튼에서 글줄 중심이 버튼 안쪽 중심과 어긋남
      if ((tag === 'button' || element.getAttribute('role') === 'button') && element.childElementCount === 0) {
        const node = Array.from(element.childNodes).find((child): boolean => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '')
        const rects = node ? lineRectsOf(node as Text) : []
        if (rects.length === 1) {
          const box = element.getBoundingClientRect()
          const inner = { top: box.top + parseFloat(style.borderTopWidth), bottom: box.bottom - parseFloat(style.borderBottomWidth) }
          const offset = Math.abs((rects[0]!.top + rects[0]!.bottom) / 2 - (inner.top + inner.bottom) / 2)
          if (offset >= MIN_MISALIGN_PX) {
            findings.push({
              element,
              mode: 'text-off-center',
              px: offset,
              detail: `버튼 안 글자가 세로 중심에서 ${Math.round(offset)}px 한쪽으로 치우침`,
              suggestions: [{ hint: 'text-centering', target: 'node', declarations: {}, reason: `버튼의 위·아래 padding 이 달라 글자가 ${Math.round(offset)}px 치우쳤습니다. padding 을 대칭으로 맞추거나 display: inline-flex; align-items: center 를 쓰세요.` }]
            })
          }
        }
      }
    }

    // 5) 아이콘과 한 줄 글자의 세로 정렬 어긋남: flex 줄에서 아이콘 중심과 글줄 중심이 다름
    if ((style.display === 'flex' || style.display === 'inline-flex') && style.flexDirection.startsWith('row') && element.childElementCount >= 2 && element.childElementCount <= 4 && isRendered(element, styleOf)) {
      // 장식 아이콘은 보통 aria-hidden 이라 isRendered 대신 실제로 그려지는지만 본다
      const children = Array.from(element.children).filter((child): boolean => styleOf(child).display !== 'none' && styleOf(child).visibility !== 'hidden' && Number(styleOf(child).opacity) !== 0)
      const icon = children.find((child): boolean => {
        const box = child.getBoundingClientRect()
        return ['svg', 'img'].includes(child.tagName.toLowerCase()) || ((child.textContent ?? '').trim() === '' && box.width <= MAX_ICON_PX && box.height <= MAX_ICON_PX && box.width >= 8)
      })
      const label = children.find((child): boolean => child !== icon && ownText(child) !== '')
      if (icon && label) {
        const node = Array.from(label.childNodes).find((child): boolean => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '')
        const rects = node ? lineRectsOf(node as Text) : []
        const iconBox = icon.getBoundingClientRect()
        if (rects.length === 1 && iconBox.height <= MAX_ICON_PX) {
          const offset = Math.abs((iconBox.top + iconBox.bottom) / 2 - (rects[0]!.top + rects[0]!.bottom) / 2)
          if (offset >= MIN_MISALIGN_PX) {
            findings.push({
              element,
              mode: 'icon-misaligned',
              px: offset,
              detail: `아이콘(${Math.round(iconBox.height)}px)과 한 줄 글자의 세로 중심이 ${Math.round(offset)}px 어긋남`,
              suggestions: [{ hint: 'align-items-center', target: 'node', declarations: { 'align-items': 'center' }, reason: `flex 줄에서 아이콘과 글자의 세로 중심이 ${Math.round(offset)}px 다릅니다. align-items: center 로 맞추세요.` }]
            })
          }
        }
      }
    }

    // 6) 같은 행 카드 높이 들쭉날쭉: 배경·테두리가 있는 형제 카드의 높이가 한 줄에서 크게 다름
    if ((style.display === 'flex' || style.display === 'grid') && element.childElementCount >= 2 && style.alignItems !== 'stretch' && style.alignItems !== 'normal' && isRendered(element, styleOf)) {
      const cards = Array.from(element.children).filter((child): boolean => {
        const childStyle = styleOf(child)
        const painted = parseColor(childStyle.backgroundColor)[3] > 0 || parseFloat(childStyle.borderTopWidth) >= 1
        return painted && childStyle.position !== 'absolute' && isRendered(child, styleOf)
      })
      const rows = new Map<number, number[]>()
      for (const card of cards) {
        const box = card.getBoundingClientRect()
        const key = Math.round(box.top / 4)
        rows.set(key, [...(rows.get(key) ?? []), box.height])
      }
      const worst = Math.max(0, ...Array.from(rows.values()).map(heightGapPx))
      if (worst > 0) {
        findings.push({
          element,
          mode: 'uneven-cards',
          px: worst,
          severity: 'low',
          detail: `같은 줄 카드 높이가 최대 ${Math.round(worst)}px 차이 나 들쭉날쭉함(align-items: ${style.alignItems})`,
          suggestions: [{ hint: 'equal-height-cards', target: 'node', declarations: { 'align-items': 'stretch' }, reason: `같은 줄 카드 높이가 ${Math.round(worst)}px 어긋납니다. align-items: stretch 로 같은 높이로 맞추세요(의도된 들쭉날쭉이면 무시).` }]
        })
      }
    }
  }

  // 7) 100vh: 모바일 주소창이 보이는 동안은 실제 화면보다 커서 아래쪽 버튼이 가려진다. 스타일시트에서 선언을 찾는다
  const declared = new Set<Element>()
  const visit = (list: CSSRuleList): void => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        const uses = ['height', 'min-height'].some((property): boolean => /(^|[^\d.])100vh\b/.test(rule.style.getPropertyValue(property)))
        if (!uses) continue
        try {
          document.querySelectorAll(rule.selectorText).forEach((match): void => void declared.add(match))
        } catch {
          // 의사 요소 등 질의할 수 없는 선택자
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
  for (const element of declared) {
    if (element === document.body || element === document.documentElement || !isRendered(element, styleOf)) continue
    if (/dvh|svh|lvh/.test((element as HTMLElement).style.minHeight + (element as HTMLElement).style.height)) continue
    const box = element.getBoundingClientRect()
    if (box.height < viewport.height * 0.8) continue
    // 아래 20% 안에 누를 것이 있어야 주소창에 가려질 수 있다
    const controls = Array.from(element.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea')).filter((control): boolean => control.getBoundingClientRect().bottom > box.bottom - box.height * 0.2)
    if (controls.length === 0) continue
    findings.push({
      element,
      mode: 'viewport-height',
      px: Math.round(box.height - viewport.height) || 1,
      severity: 'low',
      detail: `height/min-height: 100vh 요소의 아래쪽에 누를 버튼(${controls.length}개)이 있어 모바일 주소창에 가려질 수 있음`,
      suggestions: [{ hint: 'dynamic-viewport-height', target: 'node', declarations: { 'min-height': '100dvh' }, reason: '모바일 브라우저는 주소창이 보이는 동안 100vh 가 실제 보이는 높이보다 커서 아래쪽 버튼이 가려집니다. 100dvh(또는 100svh)를 쓰세요.' }]
    })
  }
  return toDefects(context, findings)
}
