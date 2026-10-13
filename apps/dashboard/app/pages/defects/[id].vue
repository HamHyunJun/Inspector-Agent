<template>
  <article v-if="context" class="defect-detail">
    <header class="defect-detail__header">
      <NuxtLink to="/" class="defect-detail__back">← 결함 목록</NuxtLink>
      <h1 class="defect-detail__title">
        <SeverityBadge :severity="context.defect.severity" />
        <code>{{ formatSourceRef(context.file, context.defect.node.source?.line) }}</code>
        <StatusBadge :status="context.defect.status" kind="defect" />
      </h1>
      <p class="defect-detail__summary">{{ context.payload.summary }}</p>
    </header>

    <section class="defect-detail__panel" aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" class="defect-detail__heading">측정값</h2>
      <dl class="defect-detail__metrics">
        <dt>뷰포트</dt>
        <dd>{{ context.payload.viewport }}</dd>
        <dt>형태</dt>
        <dd>{{ context.defect.metrics.mode === 'box' ? '박스가 부모를 넘침' : '내부 텍스트가 박스를 넘침' }}</dd>
        <dt>오버플로우</dt>
        <dd>+{{ formatPx(context.defect.metrics.overflowPx) }} ({{ formatPercent(context.defect.metrics.overflowRatio) }})</dd>
        <dt>부모 콘텐츠 / 노드 너비</dt>
        <dd>{{ formatPx(context.defect.metrics.parentContentWidth) }} / {{ formatPx(context.defect.metrics.nodeWidth) }}</dd>
        <dt>셀렉터</dt>
        <dd><code>{{ context.defect.node.selector }}</code></dd>
        <dt>페이지</dt>
        <dd>{{ context.defect.url }}</dd>
      </dl>
    </section>

    <section class="defect-detail__panel" aria-labelledby="diagnosis-heading">
      <h2 id="diagnosis-heading" class="defect-detail__heading">결정론적 진단</h2>
      <p v-if="context.defect.suggestions.length === 0" class="defect-detail__muted">규칙에 해당하는 원인을 찾지 못했습니다.</p>
      <article v-for="(suggestion, index) in context.defect.suggestions" :key="suggestion.hint" class="defect-detail__suggestion">
        <header class="defect-detail__suggestion-header">
          <code>{{ suggestion.hint }}</code>
          <span class="defect-detail__muted">{{ suggestion.target === 'node' ? '노드' : '부모' }}에 적용</span>
        </header>
        <p class="defect-detail__suggestion-reason">{{ suggestion.reason }}</p>
        <p class="defect-detail__suggestion-css"><code>{{ formatDeclarations(suggestion.declarations) }}</code></p>
        <button type="button" class="defect-detail__button" :disabled="isProposing" @click="handleRulePatch(index)">
          이 규칙으로 패치 제안
        </button>
      </article>
      <p v-if="proposeError" class="defect-detail__error" role="alert">{{ proposeError }}</p>
    </section>

    <section class="defect-detail__panel defect-detail__panel--wide" aria-labelledby="source-heading">
      <h2 id="source-heading" class="defect-detail__heading">소스 매핑</h2>
      <SourceSnippet
        v-if="context.template"
        :caption="`${context.file} · 템플릿 L${context.defect.node.source?.line}`"
        :text="context.template.text"
      />
      <p v-else class="defect-detail__muted">data-ia-src 속성이 없어 소스 위치를 알 수 없습니다. Vite 플러그인 설정을 확인하세요.</p>
      <section class="defect-detail__rules">
        <StyleRuleList title="노드 스타일 규칙" :rules="context.nodeRules" />
        <StyleRuleList title="부모 스타일 규칙" :rules="context.parentRules" />
        <StyleRuleList title="자식 스타일 규칙" :rules="context.childRules" />
      </section>
    </section>

    <section class="defect-detail__panel defect-detail__panel--wide" aria-labelledby="payload-heading">
      <h2 id="payload-heading" class="defect-detail__heading">에이전트 컨텍스트</h2>
      <p class="defect-detail__muted">
        압축 컨텍스트 약 {{ context.tokens.context.toLocaleString() }} 토큰 · 파일 전체 전달 시 약
        {{ context.tokens.rawFile.toLocaleString() }} 토큰 (4자당 1토큰 근사)
      </p>
      <pre class="defect-detail__payload"><code>{{ payloadJson }}</code></pre>
    </section>

    <section class="defect-detail__panel defect-detail__panel--wide" aria-labelledby="patches-heading">
      <h2 id="patches-heading" class="defect-detail__heading">패치 ({{ patches.length }})</h2>
      <p v-if="patches.length === 0" class="defect-detail__muted">
        아직 제안된 패치가 없습니다. Claude Code 에서 MCP 도구 <code>propose_patch</code> 를 호출하거나 위의 규칙 기반 제안을 사용하세요.
      </p>
      <PatchCard v-for="patch in patches" :key="patch.id" :patch="patch" @changed="handlePatchChanged" />
    </section>
  </article>
  <p v-else class="defect-detail__muted">결함 정보를 불러오는 중입니다.</p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DefectContext, Patch, StoredDefect } from '~~/shared/types/inspector'
import { formatPercent, formatPx, formatSourceRef } from '~/utils/format'

const route = useRoute()
const { data: context, refresh: refreshContext } = await useFetch<DefectContext>(
  (): string => `/api/defects/${String(route.params.id)}/context`
)
const { data: detail, refresh: refreshDetail } = await useFetch<{ defect: StoredDefect; patches: Patch[] }>(
  (): string => `/api/defects/${String(route.params.id)}`
)

const isProposing = ref<boolean>(false)
const proposeError = ref<string>('')

const defectId = computed((): string => String(route.params.id))
const patches = computed((): Patch[] => detail.value?.patches ?? [])
const payloadJson = computed((): string => JSON.stringify(context.value?.payload, undefined, 2))

const formatDeclarations = (declarations: Record<string, string>): string =>
  Object.entries(declarations)
    .map(([property, value]): string => `${property}: ${value};`)
    .join(' ')

const handleRulePatch = async (suggestionIndex: number): Promise<void> => {
  isProposing.value = true
  proposeError.value = ''
  try {
    await $fetch(`/api/defects/${defectId.value}/rule-patch`, { method: 'POST', body: { suggestionIndex } })
    await refreshDetail()
  } catch (error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    proposeError.value = data?.statusMessage ?? (error as Error).message
  } finally {
    isProposing.value = false
  }
}

const handlePatchChanged = async (): Promise<void> => {
  // 적용/롤백은 소스 파일과 결함 상태를 바꾸므로 컨텍스트도 다시 읽는다
  await Promise.all([refreshDetail(), refreshContext()])
}

useHead({ title: computed((): string => `결함 ${defectId.value} · Inspector-Agent`) })
</script>

<style lang="scss" scoped>
.defect-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 860px) {
    grid-template-columns: minmax(0, 1fr);
  }

  &__header {
    grid-column: 1 / -1;
  }

  &__back {
    font-size: 13px;
  }

  &__title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 8px 0 4px;
    font-size: 18px;

    code {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  &__summary {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);

    &--wide {
      grid-column: 1 / -1;
    }
  }

  &__heading {
    margin: 0;
    font-size: 15px;
  }

  &__metrics {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 16px;
    margin: 0;

    dt {
      color: var(--color-text-muted);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  }

  &__suggestion {
    padding: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  &__suggestion-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__suggestion-reason,
  &__suggestion-css {
    margin: 6px 0 0;
  }

  &__suggestion-css code {
    color: var(--color-success);
    overflow-wrap: anywhere;
  }

  &__button {
    margin-top: 8px;
    padding: 4px 12px;
    color: var(--color-accent);
    background: transparent;
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
    }
  }

  &__rules {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  &__payload {
    margin: 0;
    padding: 12px;
    max-height: 360px;
    overflow: auto;
    font-size: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  &__muted {
    margin: 0;
    color: var(--color-text-muted);
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
  }
}
</style>
