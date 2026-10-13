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
        <template v-if="context.defect.kind === 'occluded'">
          <dt>형태</dt>
          <dd>{{ OCCLUSION_CAUSE_LABEL[context.defect.metrics.cause] }}</dd>
          <dt>가려진 비율</dt>
          <dd>{{ formatPercent(context.defect.metrics.coveredRatio) }} (표본점 {{ context.defect.metrics.sampledPoints }}개)</dd>
          <dt>가린 요소</dt>
          <dd><code>{{ context.defect.metrics.occluder.selector }}</code></dd>
          <dt>stacking 비교</dt>
          <dd>
            {{ context.defect.metrics.nodeLayer.selector }} (z-index {{ context.defect.metrics.nodeLayer.zIndex ?? 'auto' }}, {{ context.defect.metrics.nodeLayer.reason }})
            ↔ {{ context.defect.metrics.occluderLayer.selector }} (z-index {{ context.defect.metrics.occluderLayer.zIndex ?? 'auto' }}, {{ context.defect.metrics.occluderLayer.reason }})
          </dd>
        </template>
        <template v-else-if="context.defect.kind === 'focus-escape'">
          <dt>형태</dt>
          <dd>Tab 키 포커스가 모달 밖으로 빠져나감</dd>
          <dt>이탈 방향</dt>
          <dd>
            <template v-if="context.defect.metrics.escapesForward">Tab {{ context.defect.metrics.tabsToEscape }}번째에서 이탈</template>
            <template v-if="context.defect.metrics.escapesForward && context.defect.metrics.escapesBackward"> · </template>
            <template v-if="context.defect.metrics.escapesBackward">Shift+Tab 으로 이탈</template>
          </dd>
          <dt>모달 / 포커스 가능 요소</dt>
          <dd>{{ context.defect.metrics.trigger }} / {{ context.defect.metrics.focusableCount }}개</dd>
          <dt>포커스 도착 지점</dt>
          <dd><code>{{ context.defect.metrics.escapedTo?.selector ?? '-' }}</code></dd>
        </template>
        <template v-else-if="context.defect.kind === 'overflow-y'">
          <dt>형태</dt>
          <dd>높이가 제한된 컨테이너 밖으로 콘텐츠가 세로로 넘쳐 아래 요소와 겹침</dd>
          <dt>넘친 양</dt>
          <dd>+{{ formatPx(context.defect.metrics.overflowPx) }}</dd>
          <dt>컨테이너 높이 / 콘텐츠 높이</dt>
          <dd>{{ formatPx(context.defect.metrics.containerHeight) }} / {{ formatPx(context.defect.metrics.contentHeight) }}</dd>
          <template v-if="context.defect.metrics.culprit">
            <dt>가장 많이 넘친 요소</dt>
            <dd><code>{{ context.defect.metrics.culprit.selector }}</code></dd>
          </template>
        </template>
        <template v-else-if="context.defect.kind === 'clipped-text'">
          <dt>형태</dt>
          <dd>overflow 로 글자가 잘리는데 말줄임(text-overflow: ellipsis)이 없어 잘린 줄 알 수 없음</dd>
          <dt>잘린 양</dt>
          <dd>{{ formatPx(context.defect.metrics.clippedPx) }} ({{ formatPercent(context.defect.metrics.hiddenRatio) }})</dd>
          <dt>보이는 너비 / 전체 텍스트 너비</dt>
          <dd>{{ formatPx(context.defect.metrics.visibleWidth) }} / {{ formatPx(context.defect.metrics.fullWidth) }}</dd>
          <dt>잘리는 텍스트</dt>
          <dd>{{ context.defect.metrics.text }}</dd>
        </template>
        <template v-else>
          <dt>형태</dt>
          <dd>{{ context.defect.metrics.mode === 'box' ? '박스가 부모를 넘침' : '내부 텍스트가 박스를 넘침' }}</dd>
          <dt>오버플로우</dt>
          <dd>+{{ formatPx(context.defect.metrics.overflowPx) }} ({{ formatPercent(context.defect.metrics.overflowRatio) }})</dd>
          <dt>부모 콘텐츠 / 노드 너비</dt>
          <dd>{{ formatPx(context.defect.metrics.parentContentWidth) }} / {{ formatPx(context.defect.metrics.nodeWidth) }}</dd>
          <template v-if="context.defect.metrics.cascaded?.length">
            <dt>연쇄 결함</dt>
            <dd>
              이 결함이 밀어내서 함께 넘친 같은 줄의 뒤쪽 요소입니다. 원인을 고치면 같이 사라집니다.
              <ul class="defect-detail__list">
                <li v-for="item in context.defect.metrics.cascaded" :key="item.selector">
                  <code>{{ item.source ? formatSourceRef(item.source.file, item.source.line) : item.selector }}</code>
                  +{{ formatPx(item.overflowPx) }}
                </li>
              </ul>
            </dd>
          </template>
        </template>
        <dt>셀렉터</dt>
        <dd><code>{{ context.defect.node.selector }}</code></dd>
        <dt>페이지</dt>
        <dd>{{ context.defect.url }}</dd>
        <template v-if="detail?.scenarioName">
          <dt>시나리오</dt>
          <dd>{{ detail.scenarioName }} (패치 후 재측정도 같은 시나리오로 합니다)</dd>
        </template>
      </dl>
    </section>

    <section v-if="sameLocation.length > 0" class="defect-detail__panel" aria-labelledby="same-location-heading">
      <h2 id="same-location-heading" class="defect-detail__heading">같은 위치의 다른 URL ({{ sameLocation.length }})</h2>
      <p class="defect-detail__muted">같은 소스 위치·뷰포트에서 나온 결함이라 이 파일을 고치면 함께 해결됩니다. 해소 여부는 해당 URL 을 다시 스캔해 확인하세요.</p>
      <ul class="defect-detail__list">
        <li v-for="member in sameLocation" :key="member.id">
          <NuxtLink :to="`/defects/${member.id}`">{{ formatUrlPath(member.url) }}</NuxtLink>
          <StatusBadge :status="member.status" kind="defect" />
        </li>
      </ul>
    </section>

    <section class="defect-detail__panel" aria-labelledby="diagnosis-heading">
      <h2 id="diagnosis-heading" class="defect-detail__heading">결정론적 진단</h2>
      <p v-if="context.defect.suggestions.length === 0" class="defect-detail__muted">규칙에 해당하는 원인을 찾지 못했습니다.</p>
      <article v-for="(suggestion, index) in context.defect.suggestions" :key="suggestion.hint" class="defect-detail__suggestion">
        <header class="defect-detail__suggestion-header">
          <code>{{ suggestion.hint }}</code>
          <span class="defect-detail__muted">{{ TARGET_LABEL[suggestion.target] }}에 적용</span>
        </header>
        <p class="defect-detail__suggestion-reason">{{ suggestion.reason }}</p>
        <p class="defect-detail__suggestion-css"><code>{{ formatDeclarations(suggestion.declarations) }}</code></p>
        <button
          v-if="Object.keys(suggestion.declarations).length > 0 && suggestion.target !== 'ancestor'"
          type="button"
          class="defect-detail__button"
          :disabled="isProposing"
          @click="handleRulePatch(index)"
        >
          이 규칙으로 패치 제안
        </button>
        <p v-else class="defect-detail__muted">선언만으로 고칠 수 없어 규칙 기반 패치를 만들지 않습니다. 에이전트 패치로 구조를 바꿔 주세요.</p>
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
      <header class="defect-detail__patches-header">
        <h2 id="patches-heading" class="defect-detail__heading">패치 ({{ patches.length }})</h2>
        <button v-if="disposableCount > 0" type="button" class="defect-detail__button" :disabled="isPruning" @click="handlePrune">
          처리된 패치 정리 ({{ disposableCount }})
        </button>
      </header>
      <p class="defect-detail__muted">거절·롤백된 패치 기록은 처리된 지 7일이 지나면 자동으로 삭제됩니다.</p>
      <p v-if="patches.length === 0" class="defect-detail__muted">
        아직 제안된 패치가 없습니다. Claude Code 에서 MCP 도구 <code>propose_patch</code> 를 호출하거나 위의 규칙 기반 제안을 사용하세요.
      </p>
      <PatchCard
        v-for="patch in patches"
        :id="`patch-${patch.id}`"
        :key="patch.id"
        :patch="patch"
        :class="{ 'defect-detail__patch--flash': patch.id === flashPatchId }"
        @changed="handlePatchChanged"
      />
    </section>
    <Transition name="toast">
      <p v-if="toastMessage" class="defect-detail__toast" role="status">{{ toastMessage }}</p>
    </Transition>
  </article>
  <p v-else class="defect-detail__muted">결함 정보를 불러오는 중입니다.</p>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { DefectContext, DefectGroupMember, Patch, StoredDefect } from '~~/shared/types/inspector'
import { selectDisposable } from '~~/shared/patch-cleanup'
import { OCCLUSION_CAUSE_LABEL, TARGET_LABEL, formatPercent, formatPx, formatSourceRef, formatUrlPath } from '~/utils/format'

const route = useRoute()
const { data: context, refresh: refreshContext } = await useFetch<DefectContext>(
  (): string => `/api/defects/${String(route.params.id)}/context`
)
const { data: detail, refresh: refreshDetail } = await useFetch<{ defect: StoredDefect; patches: Patch[]; sameLocation: DefectGroupMember[]; scenarioName?: string }>(
  (): string => `/api/defects/${String(route.params.id)}`
)

const isProposing = ref<boolean>(false)
const proposeError = ref<string>('')
const toastMessage = ref<string>('')
const flashPatchId = ref<string>('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const defectId = computed((): string => String(route.params.id))
const patches = computed((): Patch[] => detail.value?.patches ?? [])
const sameLocation = computed((): DefectGroupMember[] => detail.value?.sameLocation ?? [])
const isPruning = ref<boolean>(false)
const disposableCount = computed((): number => selectDisposable(patches.value, { defectId: defectId.value }).length)
const payloadJson = computed((): string => JSON.stringify(context.value?.payload, undefined, 2))

const formatDeclarations = (declarations: Record<string, string>): string =>
  Object.entries(declarations)
    .map(([property, value]): string => `${property}: ${value};`)
    .join(' ')

const showToast = (message: string): void => {
  toastMessage.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout((): void => {
    toastMessage.value = ''
    flashPatchId.value = ''
  }, 3500)
}

/** 이미 있는 패치 카드로 스크롤하고 잠깐 강조한다 (모션 줄이기 설정이면 즉시 이동) */
const scrollToPatch = async (patchId: string): Promise<void> => {
  flashPatchId.value = patchId
  await nextTick()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`patch-${patchId}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
}

onBeforeUnmount((): void => clearTimeout(toastTimer))

const handleRulePatch = async (suggestionIndex: number): Promise<void> => {
  isProposing.value = true
  proposeError.value = ''
  try {
    const patch = await $fetch<{ id: string; duplicated: boolean }>(`/api/defects/${defectId.value}/rule-patch`, { method: 'POST', body: { suggestionIndex } })
    await refreshDetail()
    if (patch.duplicated) {
      showToast('이미 같은 패치가 제안되어 있습니다. 아래 패치 목록에서 확인하세요.')
      await scrollToPatch(patch.id)
    }
  } catch (error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    proposeError.value = data?.statusMessage ?? (error as Error).message
  } finally {
    isProposing.value = false
  }
}

const handlePrune = async (): Promise<void> => {
  if (!window.confirm(`거절·롤백된 패치 기록 ${disposableCount.value}개를 삭제할까요? 되돌릴 수 없습니다.`)) return
  isPruning.value = true
  try {
    const result = await $fetch<{ deleted: number }>('/api/patches/prune', { method: 'POST', body: { defectId: defectId.value } })
    await refreshDetail()
    showToast(`처리된 패치 ${result.deleted}개를 정리했습니다.`)
  } catch (error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    proposeError.value = data?.statusMessage ?? (error as Error).message
  } finally {
    isPruning.value = false
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

  &__list {
    margin: 6px 0 0;
    padding: 0 0 0 18px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
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

.defect-detail__patch--flash {
  animation: patch-flash 1.4s ease-out;
}

@keyframes patch-flash {
  0% {
    box-shadow: 0 0 0 3px var(--color-accent, #0969da);
  }

  100% {
    box-shadow: 0 0 0 3px transparent;
  }
}

.defect-detail__toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 10;
  margin: 0;
  padding: 12px 16px;
  max-width: min(360px, calc(100vw - 48px));
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .defect-detail__patch--flash {
    animation: none;
  }

  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 0.01s;
  }
}
.defect-detail__patches-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
