import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 페이지 건강: 화면에는 티가 안 나도 일부가 빠져 있는 신호. 로드에 실패한 리소스(CSS·JS·API), HTTPS 페이지의 HTTP 리소스(혼합 콘텐츠),
 * 로드에 실패한 웹폰트, 렌더 중 난 콘솔 에러. 특정 요소의 결함이 아니라 문서 전체의 결함이라 <html> 에 붙이되, 리소스는 그것을 가리키는 요소를 찾아 붙인다.
 * 이미지 로드 실패는 깨진 이미지 규칙의 몫이다.
 * 콘솔 에러는 verifier 가 페이지에 심은 수집 스크립트(window.__IA_ERRORS__)가 있어야 한다.
 */

const MAX_FINDINGS_PER_KIND = 10

interface ResourceEntry {
  name: string
  initiatorType: string
  responseStatus: number
}

/** 이미지가 아닌 리소스가 4xx/5xx 로 실패했는지 */
export const isFailedResource = (entry: { initiatorType: string; responseStatus: number }): boolean => entry.initiatorType !== 'img' && entry.responseStatus >= 400

/** 본문이 있는데 파싱된 CSS 규칙이 하나도 없으면 CSS 가 아닌 응답(SPA 폴백의 index.html)일 가능성이 크다 */
export const looksLikeNonCss = (ruleCount: number, bodyBytes: number): boolean => ruleCount === 0 && bodyBytes >= 64

/** HTTPS 페이지가 HTTP 주소의 리소스를 불러오는지(브라우저가 막거나 경고한다) */
export const isMixedContent = (pageProtocol: string, resourceUrl: string): boolean => pageProtocol === 'https:' && /^http:\/\//i.test(resourceUrl)

export const detectPageHealth = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf } = context
  const root = document.documentElement
  const findings: Finding[] = []

  // 리소스 주소를 가리키는 요소를 찾아 그 요소에 결함을 붙인다(없으면 <html>)
  const referrers = new Map<string, Element>()
  for (const element of elements) {
    const reference = (element as HTMLLinkElement).href ?? (element as HTMLScriptElement).src
    if (typeof reference === 'string' && reference !== '' && !referrers.has(reference)) referrers.set(reference, element)
  }
  const resources = performance.getEntriesByType('resource') as unknown as ResourceEntry[]

  for (const entry of resources.filter(isFailedResource).slice(0, MAX_FINDINGS_PER_KIND)) {
    findings.push({
      element: referrers.get(entry.name) ?? root,
      mode: 'resource-failed',
      px: entry.responseStatus,
      key: entry.name,
      detail: `${entry.initiatorType} 리소스 ${entry.name.slice(0, 80)} 가 ${entry.responseStatus} 로 로드 실패`,
      suggestions: [{ hint: 'resource-load-failed', target: 'node', declarations: {}, reason: `${entry.name.slice(0, 120)} 요청이 ${entry.responseStatus} 로 실패했습니다. 경로(빌드 후 위치, 대소문자), 파일 존재, 서버·CORS 설정을 확인하세요.` }]
    })
  }
  // 스타일시트가 적용되지 않은 링크: 404 면 sheet 가 null 이고, SPA 폴백처럼 CSS 가 아닌 응답(200 text/html)이면 규칙이 0개인 시트가 된다
  const bodyBytesOf = new Map<string, number>(resources.map((entry): [string, number] => [entry.name, (entry as unknown as { decodedBodySize: number }).decodedBodySize ?? 0]))
  for (const element of elements) {
    if (!(element instanceof HTMLLinkElement) || !element.rel.split(/\s+/).includes('stylesheet') || element.rel.includes('alternate') || element.href === '' || element.disabled) continue
    if (findings.filter((finding): boolean => finding.mode === 'resource-failed').length >= MAX_FINDINGS_PER_KIND) break
    let applied = true
    try {
      applied = element.sheet !== null && !looksLikeNonCss(element.sheet.cssRules.length, bodyBytesOf.get(element.href) ?? 0)
    } catch {
      // 다른 출처 시트는 규칙을 읽을 수 없다. 로드는 된 것으로 본다
    }
    if (applied) continue
    findings.push({
      element,
      mode: 'resource-failed',
      px: 1,
      key: element.href,
      detail: `스타일시트 ${element.href.slice(0, 80)} 가 적용되지 않음(404 이거나 CSS 가 아닌 응답)`,
      suggestions: [{ hint: 'resource-load-failed', target: 'node', declarations: {}, reason: `${element.href.slice(0, 120)} 가 스타일시트로 적용되지 않았습니다. 경로, 파일 존재, 서버 응답의 Content-Type(text/css)을 확인하세요(SPA 폴백이 index.html 을 돌려주는 경우가 흔합니다).` }]
    })
  }
  for (const entry of resources.filter((item): boolean => isMixedContent(location.protocol, item.name)).slice(0, MAX_FINDINGS_PER_KIND)) {
    findings.push({
      element: referrers.get(entry.name) ?? root,
      mode: 'mixed-content',
      px: 1,
      key: entry.name,
      detail: `HTTPS 페이지가 HTTP 리소스 ${entry.name.slice(0, 80)} 를 불러옴(혼합 콘텐츠)`,
      suggestions: [{ hint: 'mixed-content', target: 'node', declarations: {}, reason: `${entry.name.slice(0, 120)} 를 https:// 로 바꾸거나 프로토콜 상대 경로를 쓰세요. 브라우저가 차단하면 화면 일부가 비어 보입니다.` }]
    })
  }
  document.fonts.forEach((face): void => {
    if (face.status !== 'error' || findings.filter((finding): boolean => finding.mode === 'font-failed').length >= MAX_FINDINGS_PER_KIND) return
    const family = face.family.replace(/["']/g, '')
    // 그 글꼴을 쓰려던 요소를 찾아 붙인다(없으면 <html>)
    const user = elements.find((element): boolean => styleOf(element).fontFamily.includes(family) && isRendered(element, styleOf))
    findings.push({
      element: user ?? root,
      mode: 'font-failed',
      px: 1,
      key: family,
      detail: `웹폰트 "${family}" 로드에 실패해 대체 글꼴로 보임`,
      suggestions: [{ hint: 'font-load-failed', target: 'node', declarations: {}, reason: `웹폰트 "${family}" 가 로드되지 않아 글꼴이 바뀌고 글자 폭이 달라질 수 있습니다. @font-face 의 src 경로와 형식을 확인하세요.` }]
    })
  })
  const errors = (window as unknown as { __IA_ERRORS__?: string[] }).__IA_ERRORS__ ?? []
  if (errors.length > 0) {
    findings.push({
      element: root,
      mode: 'console-error',
      px: errors.length,
      key: 'console',
      detail: `콘솔 에러 ${errors.length}건: "${errors[0]!.slice(0, 100)}"`,
      suggestions: [{ hint: 'console-error', target: 'node', declarations: {}, reason: `렌더 중 에러가 났습니다("${errors[0]!.slice(0, 160)}"). 화면 일부가 그려지지 않았을 수 있으니 브라우저 콘솔에서 스택을 확인하세요.` }]
    })
  }
  return toDefects(context, findings)
}
