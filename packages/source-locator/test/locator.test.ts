import { describe, expect, it } from 'vitest'
import { buildDeclarationPatch, cssImports, locateSourceRules, locateStyleRules, locateStylesheetRules, moduleLocalName, outlineSfc, readSnippet, resolveNestedSelector, subjectClasses } from '../src'

const sfc = `<template>
  <article class="card">
    <p class="card__title">긴 제목</p>
  </article>
</template>

<script setup lang="ts">
const title = '긴 제목'
</script>

<style lang="scss" scoped>
.card {
  display: flex;

  &__title {
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .badge {
      width: 400px;
    }
  }
}
</style>
`

describe('resolveNestedSelector', () => {
  it('& 와 하위 선택자를 펼친다', () => {
    expect(resolveNestedSelector(['.card'], '&__title, .x')).toEqual(['.card__title', '.card .x'])
  })
})

describe('subjectClasses', () => {
  it('마지막 compound 의 클래스만 반환한다', () => {
    expect(subjectClasses('.card > .card__title.is-active:hover')).toEqual(['card__title', 'is-active'])
  })
})

describe('locateStyleRules', () => {
  it('중첩 SCSS 규칙의 파일 기준 라인을 찾는다', () => {
    const [match] = locateStyleRules(sfc, ['card__title'])
    expect(match?.selector).toBe('.card__title')
    expect(match?.line).toBe(15)
    expect(match?.declarations).toEqual([{ property: 'white-space', value: 'nowrap', line: 16 }])
    expect(match?.scoped).toBe(true)
  })

  it('@media 조건을 함께 기록한다', () => {
    const [match] = locateStyleRules(sfc, ['badge'])
    expect(match?.selector).toBe('.card .badge')
    expect(match?.atRules).toEqual(['@media (max-width: 600px)'])
    expect(match?.line).toBe(20)
  })

  it('조상 셀렉터에만 등장하는 클래스는 대상이 아니다', () => {
    expect(locateStyleRules(sfc, ['card']).map((m) => m.selector)).toEqual(['.card'])
  })
})

describe('readSnippet / outlineSfc', () => {
  it('기준 라인을 > 로 표시한다', () => {
    expect(readSnippet(sfc, 3, 1).text).toBe('  2 |   <article class="card">\n> 3 |     <p class="card__title">긴 제목</p>\n  4 |   </article>')
  })

  it('블록 범위를 요약한다', () => {
    const outline = outlineSfc(sfc)
    expect(outline.templateRange?.startLine).toBe(1)
    expect(outline.styleRanges[0]?.lang).toBe('scss')
  })
})

describe('buildDeclarationPatch', () => {
  it('기존 규칙의 같은 속성은 값을 바꾸고 새 속성은 뒤에 추가한다', () => {
    const rules = locateStyleRules(sfc, ['card__title'])
    const result = buildDeclarationPatch(sfc, rules, ['card__title'], { 'white-space': 'normal', 'min-width': '0' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.edits[0]?.oldText).toBe('  &__title {\n    white-space: nowrap;')
    expect(result.edits[0]?.newText).toBe('  &__title {\n    white-space: normal;\n    min-width: 0;')
  })

  it('규칙이 없으면 스타일 블록 끝에 새 규칙을 만든다', () => {
    const result = buildDeclarationPatch(sfc, [], ['card__body'], { 'min-width': '0' })
    expect(result.ok && result.edits[0]?.newText).toBe('\n.card__body {\n  min-width: 0;\n}\n</style>')
  })
})

const scssFile = `.list {
  display: grid;

  &__item {
    width: 400px;
  }
}

@media (max-width: 600px) {
  .list__item {
    width: 100%;
  }
}
`

describe('locateStylesheetRules', () => {
  it('일반 .scss 에서 파일 기준 라인과 file 을 돌려준다', () => {
    const rules = locateStylesheetRules(scssFile, ['list__item'], 'src/List.scss')
    expect(rules.map((rule): number => rule.line)).toEqual([4, 10])
    expect(rules[0]).toMatchObject({ file: 'src/List.scss', selector: '.list__item', lang: 'scss', scoped: false })
    expect(rules[1]?.atRules).toEqual(['@media (max-width: 600px)'])
  })

  it('.css 는 lang 이 css 이고 SFC 규칙에도 file 이 붙는다', () => {
    expect(locateStylesheetRules('.a { color: red; }', ['a'], 'a.css')[0]?.lang).toBe('css')
    expect(locateStyleRules(sfc, ['card'], 'src/Card.vue')[0]?.file).toBe('src/Card.vue')
  })

  it('기존 규칙이 있으면 스타일시트 파일에서도 선언을 고치는 패치를 만든다', () => {
    const rules = locateStylesheetRules(scssFile, ['list__item'], 'src/List.scss')
    const result = buildDeclarationPatch(scssFile, rules, ['list__item'], { width: '100%', 'min-width': '0' })
    expect(result).toMatchObject({ ok: true, edits: [{ oldText: '  &__item {\n    width: 400px;', newText: '  &__item {\n    width: 100%;\n    min-width: 0;' }] })
  })
})

describe('CSS Modules 지원', () => {
  it('해시된 DOM 클래스에서 로컬 이름을 되돌린다', () => {
    expect(moduleLocalName('_card__title_a1B-2_1')).toBe('card__title')
    expect(moduleLocalName('_list_x9y8z_12')).toBe('list')
    expect(moduleLocalName('plain')).toBe('plain')
  })

  it('JSX 소스의 스타일 import 를 module 여부와 함께 찾는다', () => {
    const source = `import styles from './List.module.scss'\nimport './global.css'\nimport { a } from './a'\nimport x from "./x.scss"\n`
    expect(cssImports(source)).toEqual([
      { specifier: './List.module.scss', module: true },
      { specifier: './global.css', module: false },
      { specifier: './x.scss', module: false }
    ])
  })
})

describe('locateSourceRules', () => {
  const files: Record<string, string> = {
    'src/ui/Card.module.scss': '.card {\n  display: flex;\n}\n\n.title {\n  white-space: nowrap;\n}\n',
    'src/ui/Plain.css': '.plain { width: 420px; }\n'
  }
  const read = async (path: string): Promise<string> => {
    const content = files[path]
    if (content === undefined) throw new Error('없음')
    return content
  }
  const jsx = `import styles from './Card.module.scss'\nimport './Plain.css'\nimport './missing.css'\nimport 'bootstrap/dist/css/bootstrap.css'\n`

  it('JSX 의 CSS Modules 는 해시 클래스를 로컬 이름으로 되돌려, 일반 css 는 그대로 찾는다', async () => {
    const rules = await locateSourceRules('src/ui/Card.tsx', jsx, ['_title_a1b2c_3', 'plain'], read)
    expect(rules.map((rule): string => `${rule.file}:${rule.line}`)).toEqual(['src/ui/Plain.css:1', 'src/ui/Card.module.scss:5'])
  })

  it('.vue 는 SFC 스타일 블록을 찾는다', async () => {
    expect((await locateSourceRules('src/Card.vue', sfc, ['card'], read))[0]?.file).toBe('src/Card.vue')
  })
})
