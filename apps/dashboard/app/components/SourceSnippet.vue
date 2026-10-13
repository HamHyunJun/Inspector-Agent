<template>
  <figure class="source-snippet">
    <figcaption class="source-snippet__caption">{{ caption }}</figcaption>
    <pre class="source-snippet__code"><code><span
      v-for="line in lines"
      :key="line.text"
      class="source-snippet__line"
      :class="{ 'source-snippet__line--focus': line.focus }"
    >{{ line.text }}
</span></code></pre>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  caption: string
  /** source-locator readSnippet 형식 ("> 12 | code") */
  text: string
}>()

interface SnippetLine {
  text: string
  focus: boolean
}

const lines = computed((): SnippetLine[] =>
  props.text.split('\n').map((text): SnippetLine => ({ text: text.slice(1), focus: text.startsWith('>') }))
)
</script>

<style lang="scss" scoped>
.source-snippet {
  margin: 0;

  &__caption {
    margin-bottom: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  &__code {
    margin: 0;
    padding: 8px 0;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.6;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  &__line {
    display: block;
    padding: 0 12px;
    white-space: pre;

    &--focus {
      background: rgba(122, 162, 255, 0.16);
    }
  }
}
</style>
