import type { DefectKind, FixHint, PatchEdit, Scenario } from '@inspector-agent/core'

/**
 * playground 앱에 심어 둔 결함의 정답표.
 * 375px 에서는 아래 9건(오버플로우 5 + 가려짐 3 + 포커스 이탈 1)만 탐지되어야 하고, 768px/1280px 에서는 0건이어야 한다.
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
  /** 이 결함에 연쇄 결함으로 묶여야 하는 같은 줄 형제 수. 형제가 별개 결함으로 따로 나오면 정답표 위반이다 */
  cascadedCount?: number
  /** 다른 URL(SECOND_PAGE_QUERY)에도 같은 컴포넌트가 나오는 결함. 대시보드에서는 URL 이 달라도 한 그룹으로 묶여야 한다 */
  alsoOnSecondPage?: boolean
}

export const EXPECTED_AT_MOBILE: ExpectedDefect[] = [
  { file: 'src/components/ProductCard.vue', kind: 'overflow-x', primaryHint: 'flex-item-min-width', description: 'flex item min-width:auto + nowrap 제목 (복합 원인)' },
  { file: 'src/components/TagList.vue', kind: 'overflow-x', primaryHint: 'flex-shrink-disabled', description: '줄바꿈 없는 flex + flex-shrink:0 태그' },
  { file: 'src/components/PromoBanner.vue', kind: 'overflow-x', primaryHint: 'fixed-width', description: '데스크톱 기준 고정 너비 420px' },
  { file: 'src/components/ShareLink.vue', kind: 'overflow-x', primaryHint: 'unbreakable-text', description: '공백 없는 긴 URL' },
  {
    file: 'src/components/MemberRow.vue',
    kind: 'overflow-x',
    primaryHint: 'flex-item-min-width',
    description: '긴 이름(nowrap)이 알약을 넘치며 뒤의 배지를 밀어냄 (원인 1건 + 연쇄 1건), 다른 URL 에도 같은 결함',
    cascadedCount: 1,
    alsoOnSecondPage: true
  },
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

/** 같은 컴포넌트를 다른 URL 에서 보여 주는 playground 화면 (URL 그룹핑 재현) */
export const SECOND_PAGE_QUERY = '?page=members'

/**
 * 시나리오로만 보이는 결함. 기본 상태의 playground 에는 없다(메뉴가 닫혀 있고, 닉네임 시드가 없으면 렌더링되지 않는다).
 * 시나리오로 스캔하면 검출되고, 같은 URL 을 일반 스캔하면 보이지 않아야 한다.
 */
export const PLAYGROUND_SCENARIO: Scenario = {
  name: 'playground: 메뉴 열기 + 닉네임 시드',
  seed: { localStorage: { 'ia-demo-nickname': 'ia_demo_nickname_with_a_very_long_unbroken_handle_that_cannot_wrap_anywhere_2026' } },
  steps: [
    { action: 'click', selector: '.open-menu__trigger' },
    { action: 'wait', selector: '.open-menu__list' }
  ]
}

export const SCENARIO_ONLY: ExpectedDefect[] = [
  {
    file: 'src/components/OpenMenu.vue',
    kind: 'occluded',
    primaryHint: 'stacking-context-trap',
    description: '클릭해야 열리는 메뉴가 transform 카드의 stacking context 에 갇혀 막대에 가려짐 (열기 전에는 결함 없음)',
    referenceEdits: [{ oldText: '\n    transform: translateY(0);', newText: '' }]
  },
  {
    file: 'src/components/SeededChip.vue',
    kind: 'overflow-x',
    primaryHint: 'unbreakable-text',
    description: 'localStorage 시드가 있어야 그려지는 긴 닉네임이 줄바꿈되지 않고 넘침 (시드 없으면 렌더링 안 됨)'
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
