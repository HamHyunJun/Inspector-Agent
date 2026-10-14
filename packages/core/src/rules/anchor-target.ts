import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 앵커 대상 없음: href="#section" 인데 그 id(또는 name)를 가진 요소가 없어 눌러도 아무 데도 가지 않는 링크.
 * 페이지 안 목차, "맨 위로", 건너뛰기 링크에서 흔하다. 해시 라우터(#/path)와 빈 해시(#)는 제외한다.
 */

/** 해시 문자열이 문서 안 이동 대상을 가리키는지(빈 해시, #!, 해시 라우터는 아님) */
export const fragmentTarget = (hash: string): string | undefined => {
  if (hash.length <= 1 || hash.startsWith('#/') || hash.startsWith('#!')) return undefined
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

export const detectAnchorTarget = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf } = context
  const findings: Finding[] = []
  for (const element of elements) {
    if (!(element instanceof HTMLAnchorElement) || !element.hasAttribute('href') || !isRendered(element, styleOf)) continue
    const href = element.getAttribute('href') ?? ''
    if (!href.startsWith('#')) continue
    const id = fragmentTarget(href)
    if (id === undefined || document.getElementById(id) !== null || document.getElementsByName(id).length > 0) continue
    findings.push({
      element,
      mode: 'anchor-missing',
      px: 1,
      detail: `링크 href="${href.slice(0, 40)}" 의 대상 id 가 문서에 없어 눌러도 이동하지 않음`,
      suggestions: [{ hint: 'anchor-target', target: 'node', declarations: {}, reason: `"${id}" 를 id 로 가진 요소가 없습니다. 대상 요소에 id 를 달거나 href 를 고치세요(대소문자, 렌더 조건으로 빠진 섹션도 확인).` }]
    })
  }
  return toDefects(context, findings)
}
