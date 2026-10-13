<template>
  <section class="defect-table" aria-labelledby="defect-table-heading">
    <header class="defect-table__header">
      <h2 id="defect-table-heading" class="defect-table__heading">탐지된 결함</h2>
      <form class="defect-table__filter" @submit.prevent="handleSubmit">
        <label for="defect-status-filter">상태</label>
        <select id="defect-status-filter" v-model="selectedStatus" @change="handleSubmit">
          <option value="">전체</option>
          <option v-for="(label, value) in DEFECT_STATUS_LABEL" :key="value" :value="value">{{ label }}</option>
        </select>
      </form>
    </header>
    <p v-if="groups.length === 0" class="defect-table__empty">조건에 맞는 결함이 없습니다. 페이지를 스캔해 보세요.</p>
    <section v-else class="defect-table__scroll" tabindex="0" aria-label="결함 표, 가로로 스크롤할 수 있습니다">
      <table class="defect-table__table">
        <caption class="defect-table__caption">심각도와 크기 순으로 정렬한 결함 {{ groups.length }}건 (같은 소스 위치·뷰포트는 URL 이 달라도 한 건으로 묶음)</caption>
        <thead>
          <tr>
            <th scope="col">심각도</th>
            <th scope="col">소스 위치</th>
            <th scope="col">뷰포트</th>
            <th scope="col">형태</th>
            <th scope="col">오버플로우</th>
            <th scope="col">진단</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groups" :key="group.key">
            <td><SeverityBadge :severity="group.defect.severity" /></td>
            <th scope="row" class="defect-table__source">
              <NuxtLink :to="`/defects/${group.defect.id}`">
                {{ formatSourceRef(group.defect.node.source?.file, group.defect.node.source?.line) }}
              </NuxtLink>
              <span class="defect-table__selector">{{ group.defect.node.selector }}</span>
              <details v-if="group.members.length > 1" class="defect-table__urls">
                <summary>발생 URL {{ group.members.length }}개</summary>
                <ul class="defect-table__url-list">
                  <li v-for="member in group.members" :key="member.id">
                    <NuxtLink :to="`/defects/${member.id}`">{{ formatUrlPath(member.url) }}</NuxtLink>
                    <StatusBadge :status="member.status" kind="defect" />
                  </li>
                </ul>
              </details>
              <span v-else class="defect-table__selector">{{ formatUrlPath(group.defect.url) }}</span>
            </th>
            <td>{{ group.defect.viewport.width }}px</td>
            <td>{{ kindLabel(group.defect) }}</td>
            <td class="defect-table__number">
              {{ sizeLabel(group.defect) }}
              <span v-if="cascadeCount(group.defect) > 0" class="defect-table__cascade">연쇄 결함 {{ cascadeCount(group.defect) }}건</span>
            </td>
            <td>
              <code v-for="suggestion in group.defect.suggestions" :key="suggestion.hint" class="defect-table__hint">
                {{ suggestion.hint }}
              </code>
            </td>
            <td><StatusBadge :status="group.status" kind="defect" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DefectGroupSummary, DefectStatus, StoredDefect } from '~~/shared/types/inspector'
import { DEFECT_STATUS_LABEL, formatPercent, formatPx, formatSourceRef, formatUrlPath } from '~/utils/format'

defineProps<{
  groups: DefectGroupSummary[]
}>()

const emit = defineEmits<{
  filter: [status: DefectStatus | '']
}>()

const KIND_LABEL: Record<StoredDefect['kind'], string> = { 'overflow-x': '오버플로우', occluded: '가려짐', 'focus-escape': '포커스 이탈' }

const kindLabel = (defect: StoredDefect): string =>
  defect.kind === 'overflow-x' ? (defect.metrics.mode === 'box' ? '박스' : '콘텐츠') : KIND_LABEL[defect.kind]

const sizeLabel = (defect: StoredDefect): string => {
  if (defect.kind === 'occluded') return formatPercent(defect.metrics.coveredRatio)
  if (defect.kind === 'focus-escape') return `${Number(defect.metrics.escapesForward) + Number(defect.metrics.escapesBackward)}방향`
  return `+${formatPx(defect.metrics.overflowPx)}`
}

/** 이 결함이 밀어낸 뒤쪽 형제(연쇄 결함) 수. 오버플로우 결함에만 있다 */
const cascadeCount = (defect: StoredDefect): number => (defect.kind === 'overflow-x' ? (defect.metrics.cascaded?.length ?? 0) : 0)

const selectedStatus = ref<DefectStatus | ''>('')

const handleSubmit = (): void => {
  emit('filter', selectedStatus.value)
}
</script>

<style lang="scss" scoped>
.defect-table {
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);

  &__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__heading {
    margin: 0;
    font-size: 16px;
  }

  &__filter {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      color: var(--color-text-muted);
    }

    select {
      padding: 6px 8px;
      color: var(--color-text);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
    }
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__scroll {
    overflow-x: auto;
  }

  &__table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;

    th,
    td {
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
      border-top: 1px solid var(--color-border);
    }

    thead th {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-muted);
      border-top: 0;
    }
  }

  &__caption {
    padding-bottom: 8px;
    font-size: 12px;
    text-align: left;
    color: var(--color-text-muted);
  }

  &__source {
    font-weight: 400;

    a {
      font-family: var(--font-mono);
    }
  }

  &__selector {
    display: block;
    max-width: 280px;
    overflow: hidden;
    font-size: 12px;
    color: var(--color-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__urls {
    margin-top: 4px;
    font-size: 12px;
    font-weight: 400;

    summary {
      cursor: pointer;
      color: var(--color-text-muted);
    }
  }

  &__url-list {
    margin: 4px 0 0;
    padding: 0 0 0 16px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
  }

  &__cascade {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 400;
    color: var(--color-text-muted);
  }

  &__number {
    font-family: var(--font-mono);
    color: var(--color-danger);
  }

  &__hint {
    display: inline-block;
    margin: 0 4px 4px 0;
    padding: 1px 6px;
    font-size: 12px;
    background: var(--color-surface-raised);
    border-radius: 4px;
  }
}
</style>
