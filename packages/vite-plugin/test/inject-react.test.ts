import { describe, expect, it } from 'vitest'
import { injectReactSourceAttributes } from '../src/inject-react'

const tsx = `import Card from './Card'

export const List = (): JSX.Element => (
  <section className="list">
    <Card />
    <Foo.Bar />
    <>
      <p className="list__empty">비어 있음</p>
    </>
  </section>
)
`

describe('injectReactSourceAttributes', () => {
  it('소문자 요소에 파일:라인:컬럼 을 주입하고 컴포넌트·멤버·Fragment 는 건너뛴다', () => {
    const result = injectReactSourceAttributes(tsx, 'src/List.tsx')
    expect(result?.injected).toBe(2)
    expect(result?.code).toContain('<section data-ia-src="src/List.tsx:4:3" className="list">')
    expect(result?.code).toContain('<p data-ia-src="src/List.tsx:8:7" className="list__empty">')
    expect(result?.code).toContain('<Card />')
    expect(result?.code).toContain('<Foo.Bar />')
  })

  it('self-closing 요소와 이미 속성이 있는 요소를 처리한다', () => {
    const code = 'const a = <div><img src="x" /><span data-ia-src="manual" /></div>'
    const result = injectReactSourceAttributes(code, 'a.jsx')
    expect(result?.injected).toBe(2)
    expect(result?.code).toContain('<img data-ia-src="a.jsx:1:16" src="x" />')
    expect(result?.code).toContain('<span data-ia-src="manual" />')
  })

  it('TSX 제네릭 화살표 함수를 파싱한다', () => {
    const code = 'const f = <T,>(x: T): JSX.Element => <b>{String(x)}</b>'
    expect(injectReactSourceAttributes(code, 'a.tsx')?.injected).toBe(1)
  })

  it('경로의 따옴표·앰퍼샌드를 이스케이프한다', () => {
    const result = injectReactSourceAttributes('const a = <p />', 'a&"b.jsx')
    expect(result?.code).toContain('data-ia-src="a&amp;&quot;b.jsx:1:11"')
  })

  it('문법 오류나 JSX 없는 파일은 변환하지 않는다', () => {
    expect(injectReactSourceAttributes('const a = <div', 'a.jsx')).toBeUndefined()
    expect(injectReactSourceAttributes('export const a = 1', 'a.jsx')).toBeUndefined()
  })
})
