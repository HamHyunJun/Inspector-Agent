import type { Rect } from './types'

/** 여러 규칙(detector, rules/*)이 함께 쓰는 DOM 헬퍼 */

export const round = (value: number): number => Math.round(value * 10) / 10

export const toRect = (rect: DOMRect): Rect => ({
  x: round(rect.x),
  y: round(rect.y),
  width: round(rect.width),
  height: round(rect.height),
  right: round(rect.right),
  bottom: round(rect.bottom)
})

/** transform/rotate/scale/translate 가 걸렸는지. getBoundingClientRect 는 변환 후 사각형이라 레이아웃 박스와 달라진다 */
export const isTransformed = (style: CSSStyleDeclaration): boolean =>
  [style.transform, style.rotate, style.scale, style.translate].some((value): boolean => value !== '' && value !== 'none')

export const ownText = (element: Element): string => {
  let text = ''
  element.childNodes.forEach((child): void => {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ''
  })
  return text.replace(/\s+/g, ' ').trim()
}

export const buildSelector = (element: Element): string => {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 4) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`${tag}#${current.id}`)
      break
    }
    const classes = Array.from(current.classList)
      .filter((name): boolean => !name.startsWith('data-v-'))
      .slice(0, 2)
    let part = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag
    const parentElement: Element | null = current.parentElement
    if (parentElement) {
      const sameTag = Array.from(parentElement.children).filter((child): boolean => child.tagName === current?.tagName)
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
    }
    parts.unshift(part)
    current = parentElement
  }
  return parts.join(' > ')
}

/** 요소 하나를 압축 스냅샷으로 만든다. detect 와 포커스 탐침(focus.ts)이 같은 모양을 쓰도록 공유한다 */
