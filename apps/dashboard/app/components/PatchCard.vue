<template>
  <article class="patch-card">
    <header class="patch-card__header">
      <StatusBadge :status="patch.status" kind="patch" />
      <span class="patch-card__author">{{ AUTHOR_LABEL[patch.author] }}</span>
      <code class="patch-card__file">{{ patch.file }}</code>
      <time class="patch-card__time" :datetime="patch.createdAt">{{ formatDateTime(patch.createdAt) }}</time>
    </header>
    <p v-if="patch.rationale" class="patch-card__rationale">{{ patch.rationale }}</p>
    <DiffViewer :diff="patch.diff" :label="`${patch.file} 변경 사항`" />
    <section v-if="patch.verification || patch.error" class="patch-card__verification" :class="verificationClass">
      <h4 class="patch-card__verification-heading">재측정 결과</h4>
      <p v-if="patch.verification" class="patch-card__verdict">{{ patch.verification.verdict }}</p>
      <p v-if="patch.verification" class="patch-card__metric">
        <span>전 {{ formatMeasure(patch.verification.beforePx, patch.verification.unit) }}</span>
        <span aria-hidden="true">→</span>
        <span>후 {{ formatMeasure(patch.verification.afterPx, patch.verification.unit) }}</span>
        <span>· 문서 가로 스크롤 {{ formatPx(patch.verification.documentOverflowPx) }}</span>
      </p>
      <ul v-if="patch.verification?.regressions.length" class="patch-card__regressions">
        <li v-for="regression in patch.verification.regressions" :key="regression.id">
          회귀: {{ formatSourceRef(regression.node.source?.file, regression.node.source?.line) }}
          <template v-if="regression.kind === 'occluded'">가려짐 {{ formatPercent(regression.metrics.coveredRatio) }} ({{ regression.metrics.cause }})</template>
          <template v-else-if="regression.kind === 'focus-escape'">모달 포커스 이탈</template>
          <template v-else>+{{ formatPx(regression.metrics.overflowPx) }} ({{ regression.metrics.mode }})</template>
        </li>
      </ul>
      <p v-if="patch.error" class="patch-card__verdict">{{ patch.error }}</p>
      <p v-if="patch.autoRolledBack" class="patch-card__note">검증에 실패해 원본 파일로 자동 롤백했습니다.</p>
    </section>
    <footer class="patch-card__actions">
      <button v-if="patch.status === 'proposed'" type="button" class="patch-card__button patch-card__button--primary" :disabled="isBusy" @click="handleAction('apply')">
        {{ isBusy ? '적용 후 재측정 중…' : '적용하고 검증' }}
      </button>
      <button v-if="patch.status === 'proposed'" type="button" class="patch-card__button" :disabled="isBusy" @click="handleAction('reject')">
        거절
      </button>
      <button v-if="canRollback" type="button" class="patch-card__button" :disabled="isBusy" @click="handleAction('rollback')">
        롤백
      </button>
    </footer>
    <p v-if="errorMessage" class="patch-card__error" role="alert">{{ errorMessage }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Patch } from '~~/shared/types/inspector'
import { formatDateTime, formatMeasure, formatPercent, formatPx, formatSourceRef } from '~/utils/format'

const props = defineProps<{
  patch: Patch
}>()

const emit = defineEmits<{
  changed: [patch: Patch]
}>()

type PatchAction = 'apply' | 'reject' | 'rollback'

const AUTHOR_LABEL: Record<Patch['author'], string> = {
  agent: '에이전트 제안',
  rule: '규칙 기반 제안',
  human: '직접 작성'
}

const isBusy = ref<boolean>(false)
const errorMessage = ref<string>('')

const canRollback = computed(
  (): boolean => (props.patch.status === 'verified' || props.patch.status === 'failed') && !props.patch.autoRolledBack
)
const verificationClass = computed((): string =>
  props.patch.verification?.passed ? 'patch-card__verification--passed' : 'patch-card__verification--failed'
)

const handleAction = async (action: PatchAction): Promise<void> => {
  isBusy.value = true
  errorMessage.value = ''
  try {
    const updated = await $fetch<Patch>(`/api/patches/${props.patch.id}/${action}`, { method: 'POST' })
    emit('changed', updated)
  } catch (error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    errorMessage.value = data?.statusMessage ?? (error as Error).message
  } finally {
    isBusy.value = false
  }
}
</script>

<style lang="scss" scoped>
.patch-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);

  &__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  &__author,
  &__time {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  &__file {
    min-width: 0;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  &__rationale {
    margin: 0;
  }

  &__verification {
    padding: 12px;
    border-left: 3px solid;
    border-radius: 6px;
    background: var(--color-bg);

    &--passed {
      border-color: var(--color-success);
    }

    &--failed {
      border-color: var(--color-danger);
    }
  }

  &__verification-heading {
    margin: 0 0 4px;
    font-size: 13px;
  }

  &__verdict,
  &__metric,
  &__note {
    margin: 0;
  }

  &__metric {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
  }

  &__note {
    margin-top: 4px;
    font-size: 12px;
    color: var(--color-warning);
  }

  &__regressions {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--color-danger);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__button {
    padding: 6px 14px;
    color: var(--color-text);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    cursor: pointer;

    &--primary {
      font-weight: 700;
      color: #0b0d12;
      background: var(--color-success);
      border-color: var(--color-success);
    }

    &:disabled {
      opacity: 0.6;
      cursor: progress;
    }
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
  }
}
</style>
