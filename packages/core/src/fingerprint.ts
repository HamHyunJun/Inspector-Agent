import type { DefectKind, SourceLocation } from './types'

/** FNV-1a 32bit. 의존성 없이 브라우저/노드 양쪽에서 같은 값을 낸다 */
export const hashString = (input: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const formatSource = (source: SourceLocation): string =>
  `${source.file}:${source.line}:${source.column}`

/** data-ia-src 속성 값("src/A.vue:12:5")을 해석한다. 형식이 틀리면 undefined */
export const parseSourceAttribute = (value: string, exact: boolean): SourceLocation | undefined => {
  const match = /^(.+):(\d+):(\d+)$/.exec(value)
  if (!match) return undefined
  return { file: match[1] ?? '', line: Number(match[2]), column: Number(match[3]), exact }
}

/**
 * 패치 전후에 "같은 결함"을 찾기 위한 키.
 * 소스 위치가 있으면 DOM 구조가 바뀌어도 안정적이고, 없으면 셀렉터로 대체한다.
 * 같은 요소에서 서로 다른 규칙(모드)의 결함이 나올 수 있어, 새 규칙은 kind 에 `overflow-x:모드` 처럼 모드를 붙여 구분한다.
 */
export const createFingerprint = (
  kind: DefectKind | `${DefectKind}:${string}`,
  source: SourceLocation | undefined,
  selector: string,
  viewportWidth: number
): string => {
  const anchor = source?.exact ? formatSource(source) : selector
  return `${kind}|${anchor}|${viewportWidth}`
}

export const createDefectId = (url: string, fingerprint: string): string => {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('#')[0] ?? ''
  return `d_${hashString(`${path}|${fingerprint}`)}`
}
