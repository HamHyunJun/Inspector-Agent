<template>
  <section class="overview">
    <StatsOverview v-if="stats" :stats="stats" />
    <ScanForm @scanned="handleRefresh" />
    <DefectTable :defects="defects ?? []" @filter="handleFilter" />
  </section>
</template>

<script setup lang="ts">
import type { DashboardStats, DefectStatus, StoredDefect } from '~~/shared/types/inspector'

const statusFilter = useState<DefectStatus | ''>('defect-status-filter', (): DefectStatus | '' => '')
const { data: defects, refresh: refreshDefects } = await useFetch<StoredDefect[]>('/api/defects', {
  query: { status: statusFilter }
})
const { data: stats, refresh: refreshStats } = await useFetch<DashboardStats>('/api/stats')

const handleRefresh = async (): Promise<void> => {
  await Promise.all([refreshDefects(), refreshStats()])
}

const handleFilter = (status: DefectStatus | ''): void => {
  statusFilter.value = status
}

useHead({ title: '결함 현황 · Inspector-Agent' })
</script>

<style lang="scss" scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
