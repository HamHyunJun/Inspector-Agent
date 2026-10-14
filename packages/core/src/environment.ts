import type { ScenarioEnvironment } from './types'

/**
 * 시나리오 환경 중 페이지 안에서 적용하는 것: 글자 크기만 키우기, 모든 글 늘리기, 문서 방향 바꾸기.
 * (다크 모드·고대비·장치·엔진은 브라우저 컨텍스트 수준이라 verifier 가 만든다.)
 * 탐지 직전에 한 번 호출하고, 탐지가 끝나면 페이지를 버리므로 되돌리지 않는다.
 */

const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'option', 'svg'])
const MIN_LONG_TEXT_LENGTH = 3

/** 단어 경계에서 자른 앞쪽 절반. 늘린 글이 단어 중간에서 끊겨 이상한 글자 조각이 생기는 것을 막는다 */
export const extendText = (text: string): string => {
  const words = text.trim().split(/\s+/)
  if (words.length < 2) return `${text} ${text}`
  return `${text} ${words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(' ')}`
}

export const applyEnvironment = (environment: ScenarioEnvironment): void => {
  if (environment.direction === 'rtl') document.documentElement.setAttribute('dir', 'rtl')

  if (environment.textScale !== undefined) {
    // 먼저 전부 읽은 뒤에 쓴다: 부모 크기를 바꾸면 자식의 em 기반 크기가 흔들려 읽는 순서에 따라 결과가 달라진다
    const targets: Array<{ element: HTMLElement; size: number }> = []
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (SKIPPED_TAGS.has(element.tagName.toLowerCase()) || element.closest('svg') !== null) continue
      const hasOwnText = Array.from(element.childNodes).some((child): boolean => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '')
      if (hasOwnText || element instanceof HTMLInputElement || element instanceof HTMLSelectElement) targets.push({ element, size: parseFloat(getComputedStyle(element).fontSize) })
    }
    // 줄 높이 px 와 고정 크기 상자는 그대로 둔다. 글자 크기 설정이 키우는 것은 글자뿐이라 잘림·겹침이 실제처럼 드러난다
    for (const { element, size } of targets) element.style.setProperty('font-size', `${size * environment.textScale}px`, 'important')
  }

  if (environment.longText) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      const text = node.textContent ?? ''
      if (parent && !SKIPPED_TAGS.has(parent.tagName.toLowerCase()) && parent.closest('svg, script, style') === null && text.trim().length >= MIN_LONG_TEXT_LENGTH) nodes.push(node as Text)
    }
    for (const node of nodes) node.textContent = extendText(node.textContent ?? '')
  }
}
