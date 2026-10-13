import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { InjectResult } from './inject'

/**
 * JSX/TSX 의 일반 HTML 요소(소문자 태그)에 소스 위치 속성을 주입한다. Vue 의 inject.ts 와 같은 속성·형식(파일:라인:컬럼)이라
 * 탐지기와 대시보드는 프레임워크를 구분하지 않는다.
 *
 * React 의 fiber._debugSource(JSX dev source)를 쓰지 않고 DOM 속성으로 주입하는 이유(실측):
 * React 19 에서는 _debugSource 가 null 이고, 확장의 content script(격리된 월드)는 fiber 를 읽을 수 없다. docs/react-source-mapping.md 참고.
 * plugin-react 의 babel 옵션에 넣지 않고 독립 변환으로 둔 이유: plugin-react 6 부터는 Babel 을 쓰지 않고 SWC 변형도 있어
 * 특정 변환기에 기대면 깨진다. 원본 코드를 먼저(enforce: 'pre') 파싱하므로 라인이 원본 그대로 남는다.
 */

interface AstNode {
  type: string
  start?: number | null
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

const isNode = (value: unknown): value is AstNode => typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'

/** JSX 속성 문자열에서 해석되는 문자(&, ")를 이스케이프해 디코딩된 값이 원본 경로와 같게 한다 */
const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** 소문자로 시작하는 JSX 식별자만 HTML 요소다 (대문자는 컴포넌트, a.b 는 멤버 표현식, a:b 는 네임스페이스) */
const isHostElementName = (name: AstNode): name is AstNode & { name: string; end: number } =>
  name.type === 'JSXIdentifier' && typeof name.name === 'string' && /^[a-z]/.test(name.name) && typeof name.end === 'number'

export const injectReactSourceAttributes = (code: string, relativePath: string, attribute = 'data-ia-src'): InjectResult | undefined => {
  let program: AstNode
  try {
    program = parse(code, {
      sourceType: 'module',
      // .jsx 에서는 typescript 플러그인을 끈다 (<T>x 같은 문법이 JSX 와 충돌한다)
      plugins: relativePath.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx']
    }).program as unknown as AstNode
  } catch {
    return undefined
  }

  const magic = new MagicString(code)
  let injected = 0
  const value = escapeAttribute(relativePath)

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isNode(node)) return
    if (node.type === 'JSXOpeningElement' && isNode(node.name) && isHostElementName(node.name) && node.loc) {
      const attributes = Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : []
      const hasAttribute = attributes.some((item): boolean => item.type === 'JSXAttribute' && isNode(item.name) && item.name.name === attribute)
      if (!hasAttribute) {
        const { line, column } = node.loc.start
        // Babel 의 column 은 0-based, 우리 형식(Vue 와 동일)은 1-based
        magic.appendLeft(node.name.end, ` ${attribute}="${value}:${line}:${column + 1}"`)
        injected++
      }
    }
    for (const key of Object.keys(node)) {
      if (key !== 'loc' && key !== 'extra') visit(node[key])
    }
  }
  visit(program)
  if (injected === 0) return undefined

  return { code: magic.toString(), map: magic.generateMap({ hires: true, source: relativePath }), injected }
}
