<template>
  <section class="style-rules" :aria-label="title">
    <h4 class="style-rules__heading">{{ title }}</h4>
    <p v-if="rules.length === 0" class="style-rules__empty">같은 파일에서 대상 클래스를 스타일링하는 규칙을 찾지 못했습니다.</p>
    <article v-for="rule in rules" :key="`${rule.selector}-${rule.line}`" class="style-rules__rule">
      <header class="style-rules__rule-header">
        <code class="style-rules__selector">{{ rule.selector }}</code>
        <span class="style-rules__line">L{{ rule.line }}–{{ rule.endLine }}</span>
        <span v-for="atRule in rule.atRules" :key="atRule" class="style-rules__at">{{ atRule }}</span>
      </header>
      <p v-for="declaration in rule.declarations" :key="declaration.line" class="style-rules__declaration">
        <span class="style-rules__line">L{{ declaration.line }}</span>
        <code>{{ declaration.property }}: {{ declaration.value }};</code>
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { StyleRuleMatch } from '@inspector-agent/source-locator'

defineProps<{
  title: string
  rules: StyleRuleMatch[]
}>()
</script>

<style lang="scss" scoped>
.style-rules {
  &__heading {
    margin: 0 0 8px;
    font-size: 13px;
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__rule {
    margin-bottom: 8px;
    padding: 8px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  &__rule-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  &__selector {
    min-width: 0;
    color: var(--color-accent);
    overflow-wrap: anywhere;
  }

  &__line {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
  }

  &__at {
    font-size: 11px;
    color: var(--color-warning);
  }

  &__declaration {
    display: flex;
    gap: 8px;
    margin: 2px 0 0;
    font-size: 12px;
  }
}
</style>
