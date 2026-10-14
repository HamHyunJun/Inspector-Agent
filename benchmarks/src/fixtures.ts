import type { Defect, DefectKind, FixHint, PatchEdit, Scenario } from '@inspector-agent/core'

/**
 * playground 앱에 심어 둔 결함의 정답표.
 * 375px 에서는 아래 52건(가로 오버플로우 46 + 세로 오버플로우 1 + 텍스트 잘림 1 + 가려짐 3 + 포커스 이탈 1)만 탐지되어야 하고, 768px/1280px 에서는 0건이어야 한다.
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
  /** React 대상: 규칙 기반 패치가 수정해야 하는 스타일시트(CSS Modules/.css/.scss). 소스 매핑이 JSX 가 아니라 이 파일의 규칙을 찾았는지 검증한다 */
  styleFile?: string
  /** overflow-x 의 세부 모드(squished, overlap 등). 지정하면 같은 파일의 다른 모드와 구분한다 */
  mode?: string
  /** 특정 요소에 붙지 않는 문서 전체 결함(콘솔 에러)은 소스 파일 대신 이 선택자로 매칭한다 */
  selector?: string
  /** 다른 URL(SECOND_PAGE_QUERY)에도 같은 컴포넌트가 나오는 결함. 결과 목록에서는 URL 이 달라도 한 그룹으로 묶여야 한다 */
  alsoOnSecondPage?: boolean
}

/** 탐지된 결함이 정답표 항목인지: 파일(또는 선택자)과 종류, 지정했다면 모드까지 같아야 한다 */
export const matchesExpected = (defect: Defect, expected: ExpectedDefect): boolean =>
  (expected.selector !== undefined ? defect.node.selector === expected.selector : defect.node.source?.file === expected.file) &&
  defect.kind === expected.kind &&
  (expected.mode === undefined || (defect.kind === 'overflow-x' && defect.metrics.mode === expected.mode))

export const EXPECTED_AT_MOBILE: ExpectedDefect[] = [
  { file: 'src/components/ProductCard.vue', kind: 'overflow-x', primaryHint: 'flex-item-min-width', description: 'flex item min-width:auto + nowrap 제목 (복합 원인)' },
  { file: 'src/components/TagList.vue', kind: 'overflow-x', primaryHint: 'flex-shrink-disabled', description: '줄바꿈 없는 flex + flex-shrink:0 태그' },
  { file: 'src/components/PromoBanner.vue', kind: 'overflow-x', primaryHint: 'fixed-width', description: '데스크톱 기준 고정 너비 420px' },
  { file: 'src/components/ShareLink.vue', kind: 'overflow-x', primaryHint: 'unbreakable-text', description: '공백 없는 긴 URL' },
  { file: 'src/components/FixedHeightCard.vue', kind: 'overflow-y', primaryHint: 'fixed-height', description: '높이 64px 로 고정된 카드 밖으로 줄바꿈된 설명이 넘쳐 다음 요소와 겹침' },
  { file: 'src/components/SquishedNotice.vue', kind: 'overflow-x', primaryHint: 'flex-shrink-disabled', description: '문구가 줄바꿈되며 줄어든 flex 줄에서 원형 아이콘이 가로로만 줄어 타원이 됨(넘침·잘림 없음)' },
  { file: 'src/components/SiteFooter.vue', kind: 'overflow-x', primaryHint: 'document-overflow-source', description: '본문이 화면을 넘쳐 페이지가 가로 스크롤되는데 뷰포트 너비로만 그려진 푸터의 배경·우측 여백이 끊김' },
  { file: 'src/components/OverlapHeading.vue', kind: 'overflow-x', primaryHint: 'sibling-overlap', description: '음수 margin 으로 끌려 올라간 설명 문단이 제목 글자 위에 얹힘(넘침·잘림 없음)' },
  { file: 'src/components/StretchedThumb.vue', kind: 'overflow-x', primaryHint: 'image-aspect-ratio', description: '160×90 원본을 너비 100% + 높이 96px 로 그려 가로로 늘어남(넘침·잘림 없음)' },
  { file: 'src/components/TinyCloseBar.vue', kind: 'overflow-x', primaryHint: 'tap-target-size', description: '18px 닫기 버튼이 옆 확인 버튼과 2px 만 떨어져 있어 잘못 누르기 쉬움(넘침·잘림 없음)' },
  { file: 'src/components/NarrowLabel.vue', kind: 'overflow-x', primaryHint: 'stacked-text', description: '라벨 칸을 18px 로 고정해 "주문내역" 이 한 글자씩 네 줄로 세로로 섬(넘침·잘림 없음)' },
  { file: 'src/components/BrokenHero.vue', kind: 'overflow-x', primaryHint: 'image-load-failed', description: '좁은 화면에서 <picture> 가 고른 모바일 소스가 없어 이미지가 빈 사각형으로 보임(넘침·잘림 없음)' },
  { file: 'src/components/EmptyCard.vue', kind: 'overflow-x', mode: 'empty-space', primaryHint: 'empty-space', description: '높이 240px 로 고정한 카드의 내용 아래에 큰 빈 공간이 남음' },
  { file: 'src/components/LonelyChips.vue', kind: 'overflow-x', mode: 'lonely-wrap', primaryHint: 'lonely-wrap-item', description: '같은 크기 칩 4개가 3+1 로 줄바꿈되어 마지막 줄에 하나만 남음' },
  { file: 'src/components/LoneWordNote.vue', kind: 'overflow-x', mode: 'text-orphan', primaryHint: 'text-orphan', description: '문단 마지막 줄에 한 단어만 홀로 남음' },
  { file: 'src/components/FixedBadges.vue', kind: 'overflow-x', mode: 'fixed-overlap', primaryHint: 'fixed-layer-overlap', description: '화면에 고정된 두 떠 있는 버튼이 같은 자리에 겹침' },
  { file: 'src/components/FixedBanner.vue', kind: 'overflow-x', mode: 'fixed-hog', primaryHint: 'fixed-layer-size', description: '화면에 고정된 안내 띠가 화면 높이의 40% 를 차지해 본문을 가림' },
  { file: 'src/components/TinyNote.vue', kind: 'overflow-x', mode: 'tiny-text', primaryHint: 'min-font-size', description: '안내 문구가 10px 라 읽기 어려움' },
  { file: 'src/components/CrampedParagraph.vue', kind: 'overflow-x', mode: 'tight-leading', primaryHint: 'line-height-tight', description: '줄 높이 0.8 로 여러 줄 문단의 줄이 붙음' },
  { file: 'src/components/SmallInput.vue', kind: 'overflow-x', mode: 'input-zoom', primaryHint: 'input-font-size', description: '입력창 글자 14px 라 iOS 에서 누르면 화면이 확대됨' },
  { file: 'src/components/BlurryPhoto.vue', kind: 'overflow-x', mode: 'blurry-image', primaryHint: 'image-resolution', description: '원본 80px 이미지를 카드 너비로 늘려 그려 흐릿함' },
  { file: 'src/components/OversizedPhoto.vue', kind: 'overflow-x', mode: 'oversized-image', primaryHint: 'image-resolution', description: '원본 1600px 이미지를 200px 로만 그려 필요 이상으로 큼' },
  { file: 'src/components/ClippedPlaceholder.vue', kind: 'overflow-x', mode: 'field-clipped', primaryHint: 'field-text-clipped', description: '100px 입력창의 placeholder 끝이 잘림' },
  { file: 'src/components/StickyInert.vue', kind: 'overflow-x', mode: 'sticky-inert', primaryHint: 'sticky-container-overflow', description: '조상의 overflow-x: hidden 이 막아 sticky 제목이 붙지 않음' },
  { file: 'src/components/DeadZIndex.vue', kind: 'overflow-x', mode: 'z-index-inert', primaryHint: 'z-index-without-position', description: 'position 없이 준 z-index 가 효과 없어 위치 지정된 상자에 덮임' },
  { file: 'src/components/DeadAnchor.vue', kind: 'overflow-x', mode: 'anchor-missing', primaryHint: 'anchor-target', description: '링크 #reviews 의 대상 id 가 문서에 없음' },
  { file: 'src/components/FontFailed.vue', kind: 'overflow-x', mode: 'font-failed', primaryHint: 'font-load-failed', description: '웹폰트 파일이 없어 로드에 실패하고 대체 글꼴로 보임' },
  { file: 'src/components/ResourceProbe.vue', kind: 'overflow-x', mode: 'resource-failed', primaryHint: 'resource-load-failed', description: '존재하지 않는 스타일시트가 404 로 로드 실패' },
  { file: 'src/components/ConsoleProbe.vue', selector: 'html', kind: 'overflow-x', mode: 'console-error', primaryHint: 'console-error', description: '렌더 중 콘솔 에러(문서 전체 결함이라 <html> 선택자로 매칭)' },
  { file: 'src/components/ClickShield.vue', kind: 'overflow-x', mode: 'click-blocked', primaryHint: 'click-blocked', description: '투명 레이어가 버튼 위를 덮어 눌러도 반응하지 않음' },
  { file: 'src/components/FakeButton.vue', kind: 'overflow-x', mode: 'fake-button', primaryHint: 'fake-button', description: 'div 에 클릭만 걸어 버튼처럼 보이지만 키보드로 포커스할 수 없음' },
  { file: 'src/components/HoverMenu.vue', kind: 'overflow-x', mode: 'hover-only', primaryHint: 'hover-only-menu', description: '하위 메뉴가 :hover 로만 열려 키보드·터치로 열 수 없음' },
  { file: 'src/components/TabIndexJump.vue', kind: 'overflow-x', mode: 'tabindex-positive', primaryHint: 'tabindex-positive', description: 'tabindex="2" 가 Tab 순서를 앞당김' },
  { file: 'src/components/ShiftBanner.vue', selector: 'html', kind: 'overflow-x', mode: 'layout-shift', primaryHint: 'layout-shift', description: '로드 150ms 뒤 맨 위에 배너가 끼어들어 화면이 튐(문서 전체 결함이라 <html> 선택자로 매칭)' },
  { file: 'src/components/FocusRingless.vue', kind: 'overflow-x', mode: 'focus-ring-missing', primaryHint: 'focus-indicator', description: 'outline: none 만 쓰고 대체 포커스 표시가 없음' },
  { file: 'src/components/FocusOrder.vue', kind: 'overflow-x', mode: 'focus-order', primaryHint: 'focus-order', description: 'CSS order 로 셋째를 맨 위로 올려 Tab 이 위쪽으로 되돌아감' },
  { file: 'src/components/FixedBanner.vue', kind: 'overflow-x', mode: 'focus-covered', primaryHint: 'focus-scroll-padding', description: '화면 아래 고정된 안내 띠가 Tab 으로 이동한 요소를 가림' },
  { file: 'src/components/LowContrast.vue', kind: 'overflow-x', mode: 'low-contrast', primaryHint: 'text-contrast', description: '흰 카드 위 연한 회색 글자의 대비가 약 2:1 로 기준 4.5:1 미만' },
  { file: 'src/components/FaintBorder.vue', kind: 'overflow-x', mode: 'border-contrast', primaryHint: 'border-contrast', description: '입력창 테두리가 흰 배경과 대비 1.2:1 이라 칸이 잘 안 보임' },
  { file: 'src/components/IconMisaligned.vue', kind: 'overflow-x', mode: 'icon-misaligned', primaryHint: 'align-items-center', description: '32px 아이콘이 위쪽에 붙어 한 줄 글자와 세로 중심이 어긋남' },
  { file: 'src/components/OffCenterButton.vue', kind: 'overflow-x', mode: 'text-off-center', primaryHint: 'text-centering', description: '위·아래 padding 이 비대칭이라 버튼 안 글자가 위로 치우침' },
  { file: 'src/components/UnevenCards.vue', kind: 'overflow-x', mode: 'uneven-cards', primaryHint: 'equal-height-cards', description: 'align-items: flex-start 라 같은 줄 카드 높이가 들쭉날쭉함' },
  { file: 'src/components/FullScreenCta.vue', kind: 'overflow-x', mode: 'viewport-height', primaryHint: 'dynamic-viewport-height', description: 'min-height: 100vh 라 모바일 주소창에 아래쪽 버튼이 가려질 수 있음' },
  { file: 'src/components/BadgeClip.vue', kind: 'overflow-x', mode: 'corner-clipped', primaryHint: 'overflow-visible-parent', description: '카드의 overflow: hidden 이 모서리 밖 NEW 배지를 반쯤 잘라 먹음' },
  { file: 'src/components/CarouselNoEnd.vue', kind: 'overflow-x', mode: 'scroll-end-flush', primaryHint: 'scroll-end-padding', description: '가로 스크롤 목록 앞 여백은 있는데 끝 여백이 없어 마지막 카드가 가장자리에 붙음' },
  { file: 'src/components/DoubleScroll.vue', kind: 'overflow-x', mode: 'nested-scroll', primaryHint: 'nested-scroll', description: '화면 70% 영역이 페이지와 따로 스크롤되어 이중 스크롤바가 생김' },
  { file: 'src/components/ClippedLabel.vue', kind: 'clipped-text', primaryHint: 'text-ellipsis', description: 'overflow:hidden + nowrap 라벨이 말줄임 없이 잘려 글자가 사라짐' },
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
  seed: { localStorage: { 'ia-demo-nickname': 'ia_demo_nickname_with_a_very_long_unbroken_handle_that_cannot_wrap_anywhere_2026', 'ia-demo-scroll-lock': '1' } },
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
  },
  {
    file: 'src/components/ScrollLockProbe.vue',
    selector: 'body',
    kind: 'overflow-x',
    mode: 'scroll-locked',
    primaryHint: 'scroll-locked',
    description: 'localStorage 시드가 있으면 모달 없이 body 스크롤이 잠겨 있음 (시드 없으면 정상)'
  }
]

/**
 * 환경 변형 스캔의 정답표. 기본 상태에서는 정상이고 그 환경에서만 결함이 되는 컴포넌트다.
 * variant 는 scanPage 의 variants 이름이고, 그 변형 스캔에서 정답이 탐지되어야 하며 같은 정답이 기본 스캔에는 없어야 한다.
 */
export const VARIANT_EXPECTED: Array<{ variant: string; expected: ExpectedDefect }> = [
  { variant: 'text-scale', expected: { file: 'src/components/TextScaleBadge.vue', kind: 'clipped-text', primaryHint: 'text-ellipsis', description: '글자만 2배로 키우면 56px 칩 밖으로 잘려 말줄임 없이 사라짐' } },
  { variant: 'long-text', expected: { file: 'src/components/LongTextChip.vue', kind: 'overflow-x', mode: 'content', primaryHint: 'nowrap-text', description: '문구가 1.5배로 길어지면 줄바꿈 없는 글이 76px 칩 밖으로 넘침' } },
  { variant: 'dark', expected: { file: 'src/components/DarkModeCard.vue', kind: 'overflow-x', mode: 'low-contrast', primaryHint: 'text-contrast', description: '다크 모드에서 배경만 어두워지고 글자색은 그대로라 대비가 1.1:1' } },
  { variant: 'rtl', expected: { file: 'src/components/RtlBox.vue', kind: 'overflow-x', mode: 'box', primaryHint: 'fixed-width', description: 'RTL 에서 physical margin-right 때문에 상자가 60px 왼쪽 밖으로 밀림' } },
  { variant: 'forced-colors', expected: { file: 'src/components/ForcedColorsRing.vue', kind: 'overflow-x', mode: 'focus-ring-missing', primaryHint: 'focus-indicator', description: '포커스 표시를 box-shadow 로만 그려 고대비에서 사라짐' } },
  { variant: 'device:iphone', expected: { file: 'src/components/RetinaPhoto.vue', kind: 'overflow-x', mode: 'blurry-image', primaryHint: 'image-resolution', description: '3배 화면(iPhone)에서 400px 원본 이미지가 흐려짐' } }
]

export const NEGATIVE_CONTROLS: string[] = [
  'src/components/OrderTable.vue',
  'src/components/SortMenu.vue',
  'src/components/BadgeCard.vue',
  'src/components/ModalControl.vue',
  'src/components/DecorDots.vue',
  'src/components/HeightControls.vue',
  'src/components/TextClipControls.vue',
  'src/components/IconControls.vue',
  'src/components/LineHeightControls.vue',
  'src/components/ThumbControls.vue',
  'src/components/TapControls.vue',
  'src/components/Bundle1Controls.vue',
  'src/components/Bundle2Controls.vue',
  'src/components/Bundle3Controls.vue',
  'src/components/WrapControls.vue'
]

export const MOBILE_VIEWPORT = { width: 375, height: 812 }
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

/**
 * apps/playground-react 의 정답표. Vue playground 와 같은 가로 오버플로우 4건을 심고, 스타일 방식은 일부러 섞었다
 * (CSS Modules .module.scss / 일반 .css / 일반 .scss / CSS Modules .module.css).
 */
export const REACT_EXPECTED_AT_MOBILE: ExpectedDefect[] = [
  { file: 'src/components/ProductCard.tsx', kind: 'overflow-x', primaryHint: 'flex-item-min-width', styleFile: 'src/components/ProductCard.module.scss', description: 'flex item min-width:auto + nowrap 제목 (CSS Modules .module.scss)' },
  { file: 'src/components/TagList.tsx', kind: 'overflow-x', primaryHint: 'flex-shrink-disabled', styleFile: 'src/components/TagList.css', description: '줄바꿈 없는 flex + flex-shrink:0 태그 (일반 .css)' },
  { file: 'src/components/PromoBanner.tsx', kind: 'overflow-x', primaryHint: 'fixed-width', styleFile: 'src/components/PromoBanner.scss', description: '데스크톱 기준 고정 너비 420px (일반 .scss)' },
  { file: 'src/components/ShareLink.tsx', kind: 'overflow-x', primaryHint: 'unbreakable-text', styleFile: 'src/components/ShareLink.module.css', description: '공백 없는 긴 URL (CSS Modules .module.css)' }
]

export const REACT_NEGATIVE_CONTROLS: string[] = ['src/components/OrderTable.tsx', 'src/components/BadgeCard.tsx']
