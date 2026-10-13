import { describe, expect, it } from 'vitest'
import { buildDeclarationPatch, locateStyleRules, outlineSfc, readSnippet, resolveNestedSelector, subjectClasses } from '../src'

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
