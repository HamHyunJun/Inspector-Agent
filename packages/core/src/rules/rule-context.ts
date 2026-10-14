import { createSnapshotter } from '../detector'
import type { RuleContext } from './context'

/** detect() 밖(탭 탐침처럼 따로 호출되는 곳)에서 규칙 컨텍스트를 만든다. 스타일은 호출 동안만 캐시한다 */
export const createRuleContext = (sourceAttribute = 'data-ia-src'): RuleContext => {
  const cache = new Map<Element, CSSStyleDeclaration>()
  const styleOf = (element: Element): CSSStyleDeclaration => {
    const cached = cache.get(element)
    if (cached) return cached
    const computed = getComputedStyle(element)
    cache.set(element, computed)
    return computed
  }
  return {
    elements: Array.from(document.body.querySelectorAll<HTMLElement>('*')),
    styleOf,
    snapshot: createSnapshotter(styleOf, sourceAttribute),
    viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    url: location.href,
    detectedAt: new Date().toISOString()
  }
}
