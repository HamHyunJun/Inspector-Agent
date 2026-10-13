import type { FixHint } from '@inspector-agent/core'

/**
 * playground 앱에 심어 둔 결함의 정답표.
 * 375px 에서는 아래 4건만 탐지되어야 하고, 1280px 에서는 0건이어야 한다.
 * OrderTable.vue 는 overflow-x:auto 로 의도된 스크롤이므로 탐지되면 오탐이다.
 */
export interface ExpectedDefect {
  file: string
  /** 진단 결과 첫 번째로 나와야 하는 원인 */
  primaryHint: FixHint
  description: string
}

export const EXPECTED_AT_MOBILE: ExpectedDefect[] = [
  { file: 'src/components/ProductCard.vue', primaryHint: 'flex-item-min-width', description: 'flex item min-width:auto + nowrap 제목 (복합 원인)' },
  { file: 'src/components/TagList.vue', primaryHint: 'flex-shrink-disabled', description: '줄바꿈 없는 flex + flex-shrink:0 태그' },
  { file: 'src/components/PromoBanner.vue', primaryHint: 'fixed-width', description: '데스크톱 기준 고정 너비 420px' },
  { file: 'src/components/ShareLink.vue', primaryHint: 'unbreakable-text', description: '공백 없는 긴 URL' }
]

export const NEGATIVE_CONTROLS: string[] = ['src/components/OrderTable.vue']

export const MOBILE_VIEWPORT = { width: 375, height: 812 }
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
