<template>
  <section class="scan-form" aria-labelledby="scan-heading">
    <h2 id="scan-heading" class="scan-form__heading">페이지 스캔</h2>
    <p class="scan-form__desc">헤드리스 Chromium 으로 지정한 뷰포트마다 결정론적 탐지 규칙을 실행합니다.</p>
    <form class="scan-form__form" @submit.prevent="handleSubmit">
      <p class="scan-form__field scan-form__field--grow">
        <label for="scan-url">대상 URL</label>
        <input id="scan-url" v-model="url" type="url" required placeholder="http://localhost:5173" />
      </p>
      <p class="scan-form__field">
        <label for="scan-viewports">뷰포트 너비(쉼표 구분)</label>
        <input id="scan-viewports" v-model="viewportText" type="text" required pattern="[0-9x ,]+" />
      </p>
      <button class="scan-form__submit" type="submit" :disabled="isScanning">
        {{ isScanning ? '스캔 중…' : '스캔 실행' }}
      </button>
    </form>
    <p v-if="message" class="scan-form__message" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Viewport } from '@inspector-agent/core'
import type { ScanIngestResult } from '~~/shared/types/inspector'

const emit = defineEmits<{
  scanned: []
}>()

const url = ref<string>('http://localhost:5173')
const viewportText = ref<string>('375, 768, 1280')
const isScanning = ref<boolean>(false)
const message = ref<string>('')

const parseViewports = (text: string): Viewport[] =>
  text
    .split(',')
    .map((part): string => part.trim())
    .filter((part): boolean => part !== '')
    .map((part): Viewport => {
      const [width = '0', height] = part.split('x')
      return { width: Number(width), height: height ? Number(height) : 900 }
    })

const handleSubmit = async (): Promise<void> => {
  isScanning.value = true
  message.value = ''
  try {
    const result = await $fetch<ScanIngestResult & { defects: number }>('/api/scan', {
      method: 'POST',
      body: { url: url.value, viewports: parseViewports(viewportText.value) }
    })
    message.value = `결함 ${result.defects}건 탐지 (신규 ${result.created}, 갱신 ${result.updated}, 해소 ${result.resolved})`
    emit('scanned')
  } catch (error) {
    message.value = `스캔 실패: ${(error as Error).message}`
  } finally {
    isScanning.value = false
  }
}
</script>

<style lang="scss" scoped>
.scan-form {
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);

  &__heading {
    margin: 0;
    font-size: 16px;
  }

  &__desc,
  &__message {
    margin: 4px 0 12px;
    color: var(--color-text-muted);
  }

  &__message {
    margin: 12px 0 0;
  }

  &__form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin: 0;

    &--grow {
      flex: 1 1 260px;
    }

    label {
      color: var(--color-text-muted);
      font-size: 12px;
    }

    input {
      min-width: 0;
      padding: 8px 10px;
      color: var(--color-text);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
    }
  }

  &__submit {
    padding: 8px 16px;
    font-weight: 700;
    color: #0b0d12;
    background: var(--color-accent);
    border: 0;
    border-radius: 6px;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: progress;
    }
  }
}
</style>
