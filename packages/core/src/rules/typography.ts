import { ownText } from '../dom-utils'
import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 글자 품질 네 가지: 너무 작은 글자, 줄 높이가 글자 크기보다 좁아 줄이 붙는 문단, iOS 가 확대해 버리는 16px 미만 입력창, 문단 끝에 한두 글자만 남은 줄.
 * 모두 계산된 스타일과 글줄 좌표만 보므로 코드만 읽어서는 어떤 화면에서 그렇게 보이는지 알 수 없다.
 */

/** 본문에서 이보다 작은 글자는 읽기 어렵다(WCAG 에 절대 기준은 없지만 12px 를 하한으로 흔히 쓴다) */
export const MIN_FONT_PX = 12
/** iOS Safari 는 16px 미만 입력창에 포커스하면 화면을 확대한다 */
export const MIN_INPUT_FONT_PX = 16
/** 터치 중심 화면. 이보다 넓은 화면에서는 입력창 확대 문제가 없다 */
const MAX_TOUCH_VIEWPORT_PX = 768
/** 글자 4개 미만(아이콘 글리프, 단위)은 글자 크기를 따지지 않는다 */
const MIN_TEXT_LENGTH = 4
const MAX_ORPHAN_TEXT_LENGTH = 300
/** 마지막 줄이 이 크기(em) 이하이면 한두 글자만 남은 것이다 */
const ORPHAN_LAST_LINE_EM = 2.2
/** 앞 줄이 이 크기(em) 이상이어야 "충분히 넓은 칸에서 한 글자만 넘친 것"으로 본다 */
const ORPHAN_FIRST_LINE_EM = 8
const MAX_ORPHAN_CANDIDATES = 150
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

export const isTinyFont = (fontPx: number): boolean => fontPx > 0 && fontPx < MIN_FONT_PX

/** 줄 높이가 글자 크기보다 작으면(여러 줄일 때) 윗줄과 아랫줄 글자가 붙거나 겹친다 */
export const isTightLeading = (lineHeightPx: number, fontPx: number, lines: number): boolean =>
  lines >= 2 && Number.isFinite(lineHeightPx) && lineHeightPx > 0 && lineHeightPx < fontPx

export const triggersInputZoom = (fontPx: number): boolean => fontPx > 0 && fontPx < MIN_INPUT_FONT_PX

/** 첫 줄은 넉넉한데 마지막 줄만 한두 글자 크기인지 */
export const isOrphanLine = (lineWidths: number[], fontPx: number): boolean => {
  if (lineWidths.length < 2) return false
  const first = lineWidths[0]!
  const last = lineWidths[lineWidths.length - 1]!
  return last <= fontPx * ORPHAN_LAST_LINE_EM && first >= fontPx * ORPHAN_FIRST_LINE_EM
}

/** 글 노드 하나가 차지한 줄마다의 너비. 같은 줄에 걸친 조각은 합친다 */
const lineWidthsOf = (node: Text): number[] => {
  const range = document.createRange()
  range.selectNodeContents(node)
  const lines: Array<{ top: number; width: number }> = []
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width === 0) continue
    const line = lines.find((item): boolean => Math.abs(item.top - rect.top) <= 2)
    if (line) line.width += rect.width
    else lines.push({ top: rect.top, width: rect.width })
  }
  return lines.sort((a, b): number => a.top - b.top).map((line): number => line.width)
}

export const detectTypography = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, viewport } = context
  const findings: Finding[] = []
  let orphanTested = 0

  for (const element of elements) {
    const tag = element.tagName.toLowerCase()
    const isField = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
    if (isField) {
      if (viewport.width > MAX_TOUCH_VIEWPORT_PX || (element instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(element.type))) continue
      if (!isRendered(element, styleOf)) continue
      const fontPx = parseFloat(styleOf(element).fontSize)
      if (!triggersInputZoom(fontPx)) continue
      findings.push({
        element,
        mode: 'input-zoom',
        px: MIN_INPUT_FONT_PX - fontPx,
        detail: `${tag}${element.id ? `#${element.id}` : ''} 의 글자 크기가 ${Math.round(fontPx * 10) / 10}px 로 16px 미만이라 iOS 에서 누르면 화면이 확대됨`,
        suggestions: [{ hint: 'input-font-size', target: 'node', declarations: { 'font-size': `${MIN_INPUT_FONT_PX}px` }, reason: `입력창 글자가 ${Math.round(fontPx)}px 라 iOS Safari 가 포커스할 때 화면을 확대합니다. 16px 이상으로 올리세요(확대를 막으려고 viewport 의 user-scalable=no 를 쓰면 접근성이 깨집니다).` }]
      })
      continue
    }

    const text = ownText(element)
    if (text.length < MIN_TEXT_LENGTH || tag === 'sub' || tag === 'sup') continue
    const style = styleOf(element)
    if (!style.writingMode.startsWith('horizontal') || !isRendered(element, styleOf)) continue
    const fontPx = parseFloat(style.fontSize)

    if (isTinyFont(fontPx)) {
      findings.push({
        element,
        mode: 'tiny-text',
        px: MIN_FONT_PX - fontPx,
        severity: 'low',
        detail: `글 "${text.slice(0, 20)}" 의 크기가 ${Math.round(fontPx * 10) / 10}px 로 ${MIN_FONT_PX}px 미만이라 읽기 어려움`,
        suggestions: [{ hint: 'min-font-size', target: 'node', declarations: { 'font-size': `${MIN_FONT_PX}px` }, reason: `글자가 ${Math.round(fontPx * 10) / 10}px 라 작은 화면에서 읽기 어렵습니다. ${MIN_FONT_PX}px 이상(본문은 14~16px)으로 올리세요.` }]
      })
    }

    if (orphanTested >= MAX_ORPHAN_CANDIDATES || text.length > MAX_ORPHAN_TEXT_LENGTH) continue
    const widths: number[][] = []
    element.childNodes.forEach((child): void => {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '') widths.push(lineWidthsOf(child as Text))
    })
    // 직접 가진 글이 한 덩어리일 때만 본다(인라인 자식과 섞이면 줄의 끝을 알 수 없다)
    if (widths.length !== 1) continue
    const lines = widths[0]!
    orphanTested++
    const lineHeightPx = parseFloat(style.lineHeight)
    if (isTightLeading(lineHeightPx, fontPx, lines.length)) {
      findings.push({
        element,
        mode: 'tight-leading',
        px: fontPx - lineHeightPx,
        detail: `${lines.length}줄 문단의 줄 높이가 ${Math.round(lineHeightPx * 10) / 10}px 로 글자 크기 ${Math.round(fontPx * 10) / 10}px 보다 작아 줄이 붙음`,
        suggestions: [{ hint: 'line-height-tight', target: 'node', declarations: { 'line-height': '1.4' }, reason: `줄 높이(${Math.round(lineHeightPx * 10) / 10}px)가 글자 크기(${Math.round(fontPx * 10) / 10}px)보다 작아 윗줄과 아랫줄이 붙거나 겹칩니다. 본문은 1.4~1.6 정도를 쓰세요.` }]
      })
    }
    if (isOrphanLine(lines, fontPx)) {
      findings.push({
        element,
        mode: 'text-orphan',
        px: 1,
        severity: 'low',
        detail: `${lines.length}줄 문단의 마지막 줄에 한두 글자만 홀로 남음`,
        suggestions: [{ hint: 'text-orphan', target: 'node', declarations: { 'text-wrap': 'pretty' }, reason: '문단 마지막 줄에 한두 글자만 남아 읽기 어색합니다. text-wrap: pretty(또는 balance)로 줄바꿈을 고르게 하세요.' }]
      })
    }
  }
  return toDefects(context, findings)
}
