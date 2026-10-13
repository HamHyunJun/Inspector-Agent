<template>
  <pre class="diff-viewer" :aria-label="label"><code><span
    v-for="(line, index) in lines"
    :key="index"
    class="diff-viewer__line"
    :class="`diff-viewer__line--${line.type}`"
  >{{ line.text }}
</span></code></pre>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  diff: string
  label?: string
}>()

type LineType = 'add' | 'remove' | 'hunk' | 'meta' | 'context'

interface DiffLine {
  type: LineType
  text: string
}

const lines = computed((): DiffLine[] =>
  props.diff
    .split('\n')
    // createTwoFilesPatch 가 붙이는 "====" 구분선과 빈 꼬리 줄은 표시하지 않는다
    .filter((text): boolean => text !== '' && !text.startsWith('==='))
    .map((text): DiffLine => ({ type: classify(text), text }))
)

const classify = (text: string): LineType => {
  if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('Index:')) return 'meta'
  if (text.startsWith('@@')) return 'hunk'
  if (text.startsWith('+')) return 'add'
  if (text.startsWith('-')) return 'remove'
  return 'context'
}
</script>

<style lang="scss" scoped>
.diff-viewer {
  margin: 0;
  padding: 12px 0;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;

  &__line {
    display: block;
    padding: 0 12px;

    &--add {
      background: var(--color-diff-add);
    }

    &--remove {
      background: var(--color-diff-remove);
    }

    &--hunk {
      color: var(--color-accent);
    }

    &--meta {
      color: var(--color-text-muted);
    }
  }
}
</style>
