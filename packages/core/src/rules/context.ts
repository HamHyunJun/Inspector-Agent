import type { NodeSnapshot, Viewport } from '../types'

/** 탐지 규칙 모듈들이 detect() 안의 공용 도구(스타일 캐시, 스냅샷)를 함께 쓰기 위한 컨텍스트 */
export interface RuleContext {
  /** document.body 아래의 모든 요소 */
  elements: HTMLElement[]
  styleOf: (element: Element) => CSSStyleDeclaration
  snapshot: (element: Element) => NodeSnapshot
  viewport: Viewport
  url: string
  detectedAt: string
}
