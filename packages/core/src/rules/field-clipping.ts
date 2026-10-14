import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 입력창 안 글 잘림: 비어 있는 입력창의 placeholder 와 select 의 선택된 항목이 칸보다 길어 끝이 잘리는 경우.
 * 일반 텍스트 잘림 규칙은 input 을 제외하고(값이 길면 스크롤해서 보므로), 사용자가 입력하기 전에 읽어야 하는 placeholder 와 선택값만 여기서 본다.
 */

/** 서브픽셀 반올림에 반응하지 않도록 이보다 적게 넘치면 무시한다 */
const MIN_CLIP_PX = 2
/** select 오른쪽 화살표가 차지하는 폭(브라우저 기본값 근사) */
const SELECT_ARROW_PX = 24
const PLACEHOLDER_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

/** 글 폭이 칸보다 넓어 잘리는 양(px). 0 이면 다 보인다 */
export const fieldClipPx = (textWidth: number, contentWidth: number): number => (textWidth - contentWidth >= MIN_CLIP_PX ? textWidth - contentWidth : 0)

export const detectFieldClipping = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf } = context
  const canvas = document.createElement('canvas').getContext('2d')
  if (!canvas) return []
  const findings: Finding[] = []

  for (const element of elements) {
    let text = ''
    let reserved = 0
    if (element instanceof HTMLInputElement && PLACEHOLDER_INPUT_TYPES.has(element.type) && element.value === '') text = element.placeholder
    else if (element instanceof HTMLSelectElement && !element.multiple && element.selectedOptions[0]) {
      text = element.selectedOptions[0].text
      reserved = SELECT_ARROW_PX
    }
    if (text.trim() === '' || !isRendered(element, styleOf)) continue

    const style = styleOf(element)
    canvas.font = style.font || `${style.fontSize} ${style.fontFamily}`
    const textWidth = canvas.measureText(text).width
    const contentWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - reserved
    if (contentWidth <= 0) continue
    const clipped = fieldClipPx(textWidth, contentWidth)
    if (clipped === 0) continue
    const what = element instanceof HTMLSelectElement ? `선택된 항목 "${text.slice(0, 20)}"` : `placeholder "${text.slice(0, 20)}"`
    findings.push({
      element,
      mode: 'field-clipped',
      px: clipped,
      detail: `입력창의 ${what} 이(가) 칸 너비 ${Math.round(contentWidth)}px 보다 ${Math.round(clipped)}px 길어 끝이 잘림`,
      suggestions: [{ hint: 'field-text-clipped', target: 'node', declarations: {}, reason: `입력창 안 글(${Math.round(textWidth)}px)이 칸(${Math.round(contentWidth)}px)보다 길어 잘립니다. 칸을 넓히거나 placeholder/선택 문구를 줄이세요.` }]
    })
  }
  return toDefects(context, findings)
}
