import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'

/** @vue/compiler-core NodeTypes / ElementTypes 값 (의존성을 늘리지 않기 위해 상수로 둔다) */
const NODE_TYPE_ELEMENT = 1
const ELEMENT_TYPE_PLAIN = 0

interface TemplateNode {
  type: number
  tag?: string
  tagType?: number
  loc: { start: { offset: number; line: number; column: number } }
  props?: Array<{ type: number; name: string }>
  children?: TemplateNode[]
}

export interface InjectResult {
  code: string
  map: ReturnType<MagicString['generateMap']>
  injected: number
}

/**
 * SFC 템플릿의 일반 HTML 요소에 소스 위치 속성을 주입한다.
 * 컴포넌트 태그는 건너뛴다: fallthrough 속성이 자식 컴포넌트 루트의 위치를 덮어쓰기 때문이다.
 */
export const injectSourceAttributes = (
  code: string,
  relativePath: string,
  attribute = 'data-ia-src'
): InjectResult | undefined => {
  const { descriptor, errors } = parse(code, { filename: relativePath, sourceMap: false })
  const ast = descriptor.template?.ast as TemplateNode | undefined
  if (errors.length > 0 || !ast || descriptor.template?.src) return undefined

  const magic = new MagicString(code)
  let injected = 0

  const visit = (node: TemplateNode): void => {
    if (
      node.type === NODE_TYPE_ELEMENT &&
      node.tagType === ELEMENT_TYPE_PLAIN &&
      node.tag !== undefined &&
      !node.props?.some((prop): boolean => prop.name === attribute)
    ) {
      const { offset, line, column } = node.loc.start
      const insertAt = offset + 1 + node.tag.length
      magic.appendLeft(insertAt, ` ${attribute}="${relativePath}:${line}:${column}"`)
      injected++
    }
    node.children?.forEach(visit)
  }

  // 루트 노드는 <template> 블록 자체이므로 자식부터 순회한다
  ast.children?.forEach(visit)
  if (injected === 0) return undefined

  return { code: magic.toString(), map: magic.generateMap({ hires: true, source: relativePath }), injected }
}
