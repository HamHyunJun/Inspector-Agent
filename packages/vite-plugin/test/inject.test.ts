import { describe, expect, it } from 'vitest'
import { injectSourceAttributes } from '../src/inject'

const sfc = `<template>
  <section class="list">
    <ItemCard v-for="item in items" :key="item" />
    <p class="list__empty">비어 있음</p>
  </section>
</template>

<script setup lang="ts">
import ItemCard from './ItemCard.vue'
const items: string[] = []
</script>
`

describe('injectSourceAttributes', () => {
  it('일반 요소에 파일:라인:컬럼 을 주입하고 컴포넌트는 건너뛴다', () => {
    const result = injectSourceAttributes(sfc, 'src/List.vue')
    expect(result?.injected).toBe(2)
    expect(result?.code).toContain('<section data-ia-src="src/List.vue:2:3" class="list">')
    expect(result?.code).toContain('<p data-ia-src="src/List.vue:4:5" class="list__empty">')
    expect(result?.code).toContain('<ItemCard v-for')
  })

  it('템플릿이 없으면 변환하지 않는다', () => {
    expect(injectSourceAttributes('<script setup lang="ts">\nconst a = 1\n</script>', 'a.vue')).toBeUndefined()
  })
})
