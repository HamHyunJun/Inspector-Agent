import type { DefectKind, FixHint, PatchEdit } from '@inspector-agent/core'

/**
 * playground 앱에 심어 둔 결함의 정답표.
 * 375px 에서는 아래 8건(오버플로우 4 + 가려짐 3 + 포커스 이탈 1)만 탐지되어야 하고, 768px/1280px 에서는 0건이어야 한다.
 * NEGATIVE_CONTROLS 의 컴포넌트는 정상 동작이므로 탐지되면 오탐이다.
 */
export interface ExpectedDefect {
  file: string
  kind: DefectKind
  /** 진단 결과 첫 번째로 나와야 하는 원인 */
  primaryHint: FixHint
  description: string
  /**
   * 규칙 기반 자동 패치로 고칠 수 없는 결함(조상·구조 변경, JS 필요)을 사람이 고친다면 이렇게 고친다는 참조 패치.
   * 검증 루프가 "제대로 고친 패치"를 통과시키는지 확인하는 데만 쓴다
   */
  referenceEdits?: PatchEdit[]
}

export const EXPECTED_AT_MOBILE: ExpectedDefect[] = [
  { file: 'src/components/ProductCard.vue', kind: 'overflow-x', primaryHint: 'flex-item-min-width', description: 'flex item min-width:auto + nowrap 제목 (복합 원인)' },
  { file: 'src/components/TagList.vue', kind: 'overflow-x', primaryHint: 'flex-shrink-disabled', description: '줄바꿈 없는 flex + flex-shrink:0 태그' },
  { file: 'src/components/PromoBanner.vue', kind: 'overflow-x', primaryHint: 'fixed-width', description: '데스크톱 기준 고정 너비 420px' },
  { file: 'src/components/ShareLink.vue', kind: 'overflow-x', primaryHint: 'unbreakable-text', description: '공백 없는 긴 URL' },
  { file: 'src/components/FilterDropdown.vue', kind: 'occluded', primaryHint: 'stacking-context-trap', description: 'transform 카드의 stacking context 에 갇힌 드롭다운 (z-index 9999 여도 가려짐)',
    referenceEdits: [{ oldText: '\n    transform: translateY(0);', newText: '' }]
  },
  { file: 'src/components/ConfirmDialog.vue', kind: 'occluded', primaryHint: 'z-index-too-low', description: '같은 컨텍스트에서 z-index 5 패널이 z-index 100 막대에 가려짐' },
  { file: 'src/components/ClippedMenu.vue', kind: 'occluded', primaryHint: 'overflow-clipped-popup', description: 'overflow:hidden 부모가 경계 밖 메뉴를 잘라냄',
    // 잘림만 풀면 다음 컴포넌트 뒤로 가려지므로, 데스크톱처럼 메뉴가 내려올 자리도 함께 비운다
    referenceEdits: [
      { oldText: 'overflow: hidden;', newText: 'overflow: visible;' },
      { oldText: '@media (min-width: 768px) {\n    padding-bottom: 150px;', newText: '@media all {\n    padding-bottom: 150px;' }
    ]
  },
  {
    file: 'src/components/ShareSheet.vue',
    kind: 'focus-escape',
    primaryHint: 'focus-trap-missing',
    description: 'aria-modal 바텀시트가 포커스를 가두지 않아 Tab 으로 모달 밖으로 나감',
    referenceEdits: [
      { oldText: 'aria-labelledby="share-sheet-title">', newText: 'aria-labelledby="share-sheet-title" @keydown.tab="trapFocus">' },
      {
        oldText: '<script setup lang="ts"></script>',
        newText: `<script setup lang="ts">
const trapFocus = (event: KeyboardEvent): void => {
  const focusable = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>`
      }
    ]
  }
]

export const NEGATIVE_CONTROLS: string[] = [
  'src/components/OrderTable.vue',
  'src/components/SortMenu.vue',
  'src/components/BadgeCard.vue',
  'src/components/ModalControl.vue',
  'src/components/DecorDots.vue'
]

export const MOBILE_VIEWPORT = { width: 375, height: 812 }
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
