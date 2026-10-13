<template>
  <section class="stats" aria-labelledby="stats-heading">
    <h2 id="stats-heading" class="stats__heading">현황</h2>
    <article v-for="item in items" :key="item.label" class="stats__item">
      <p class="stats__label">{{ item.label }}</p>
      <p class="stats__value" :class="item.tone && `stats__value--${item.tone}`">{{ item.value }}</p>
      <p v-if="item.note" class="stats__note">{{ item.note }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardStats } from '~~/shared/types/inspector'
import { formatDateTime, formatPercent } from '~/utils/format'

const props = defineProps<{
  stats: DashboardStats
}>()

interface StatItem {
  label: string
  value: string
  note?: string
  tone?: 'danger' | 'success'
}

const items = computed((): StatItem[] => {
  const { defects, patches, successRate, lastScanAt } = props.stats
  const attempts = patches.verified + patches.failed + patches['rolled-back']
  return [
    { label: '미해결 결함', value: String(defects.open), tone: defects.open > 0 ? 'danger' : undefined, note: `마지막 스캔 ${formatDateTime(lastScanAt)}` },
    { label: '해결된 결함', value: String(defects.resolved), tone: 'success' },
    { label: '검토 대기 패치', value: String(patches.proposed) },
    { label: '측정 기반 패치 성공률', value: formatPercent(successRate), note: `적용 시도 ${attempts}건 기준` }
  ]
})
</script>

<style lang="scss" scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;

  &__heading {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 16px;
  }

  &__item {
    min-width: 0;
    padding: 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
  }

  &__label,
  &__note {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__note {
    font-size: 12px;
  }

  &__value {
    margin: 4px 0;
    font-size: 28px;
    font-weight: 700;

    &--danger {
      color: var(--color-danger);
    }

    &--success {
      color: var(--color-success);
    }
  }
}
</style>
