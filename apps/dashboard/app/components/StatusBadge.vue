<template>
  <span class="status-badge" :class="`status-badge--${tone}`">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DefectStatus, PatchStatus } from '~~/shared/types/inspector'
import { DEFECT_STATUS_LABEL, PATCH_STATUS_LABEL } from '~/utils/format'

const props = defineProps<{
  status: DefectStatus | PatchStatus
  kind: 'defect' | 'patch'
}>()

type Tone = 'neutral' | 'success' | 'danger' | 'info'

const TONES: Record<DefectStatus | PatchStatus, Tone> = {
  open: 'danger',
  patched: 'info',
  resolved: 'success',
  proposed: 'info',
  verified: 'success',
  failed: 'danger',
  'rolled-back': 'neutral',
  rejected: 'neutral'
}

const label = computed((): string =>
  props.kind === 'defect'
    ? DEFECT_STATUS_LABEL[props.status as DefectStatus]
    : PATCH_STATUS_LABEL[props.status as PatchStatus]
)
const tone = computed((): Tone => TONES[props.status])
</script>

<style lang="scss" scoped>
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border: 1px solid currentColor;
  border-radius: 6px;

  &--neutral {
    color: var(--color-text-muted);
  }

  &--success {
    color: var(--color-success);
  }

  &--danger {
    color: var(--color-danger);
  }

  &--info {
    color: var(--color-accent);
  }
}
</style>
