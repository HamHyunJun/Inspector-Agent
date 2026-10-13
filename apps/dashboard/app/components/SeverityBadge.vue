<template>
  <span class="severity-badge" :class="`severity-badge--${severity}`">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Severity } from '@inspector-agent/core'
import { SEVERITY_LABEL } from '~/utils/format'

const props = defineProps<{
  severity: Severity
}>()

const label = computed((): string => SEVERITY_LABEL[props.severity])
</script>

<style lang="scss" scoped>
.severity-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;

  &--high {
    color: var(--color-danger);
    background: rgba(255, 107, 107, 0.12);
  }

  &--medium {
    color: var(--color-warning);
    background: rgba(245, 184, 75, 0.12);
  }

  &--low {
    color: var(--color-text-muted);
    background: var(--color-surface-raised);
  }
}
</style>
