import type { FixSuggestion, NodeSnapshot, OverflowMetrics, Severity } from './types'

const MEDIA_TAGS = new Set(['img', 'video', 'canvas', 'iframe', 'svg', 'picture'])

const isFlexContainer = (snapshot: NodeSnapshot): boolean => {
  const display = snapshot.styles.display ?? ''
  return display === 'flex' || display === 'inline-flex'
}

const isRowDirection = (snapshot: NodeSnapshot): boolean => {
  const direction = snapshot.styles['flex-direction'] ?? 'row'
  return direction === 'row' || direction === 'row-reverse'
}

/**
 * 노드/부모 스냅샷과 수치만으로 원인을 분류하고 후보 패치를 우선순위 순으로 반환한다.
 * LLM 없이 동작하며, 에이전트는 이 결과를 출발점으로 소스에 맞는 패치를 작성한다.
 */
export const diagnose = (
  node: NodeSnapshot,
  parent: NodeSnapshot,
  metrics: OverflowMetrics
): FixSuggestion[] => {
  const suggestions: FixSuggestion[] = []
  const nodeWhiteSpace = node.styles['white-space'] ?? 'normal'
  const inFlexRow = isFlexContainer(parent) && isRowDirection(parent)

  if (MEDIA_TAGS.has(node.tag)) {
    suggestions.push({
      hint: 'media-max-width',
      target: 'node',
      declarations: { 'max-width': '100%', height: 'auto' },
      reason: `<${node.tag}> 고유 크기(${Math.round(metrics.nodeWidth)}px)가 부모 콘텐츠 너비(${Math.round(metrics.parentContentWidth)}px)보다 큽니다.`
    })
  }

  if (inFlexRow && metrics.mode === 'box') {
    if (node.styles['flex-shrink'] === '0') {
      suggestions.push({
        hint: 'flex-shrink-disabled',
        target: 'node',
        declarations: { 'flex-shrink': '1', 'min-width': '0' },
        reason: 'flex-shrink: 0 이라 flex item이 부모 너비에 맞춰 줄어들지 못합니다.'
      })
    } else if ((node.styles['min-width'] ?? 'auto') === 'auto') {
      suggestions.push({
        hint: 'flex-item-min-width',
        target: 'node',
        declarations: { 'min-width': '0' },
        reason: 'flex item의 min-width 기본값(auto)이 콘텐츠 최소 너비 아래로 줄어드는 것을 막습니다.'
      })
    }

    if ((parent.styles['flex-wrap'] ?? 'nowrap') === 'nowrap' && parent.childElementCount > 1) {
      suggestions.push({
        hint: 'flex-nowrap',
        target: 'parent',
        declarations: { 'flex-wrap': 'wrap' },
        reason: `flex 컨테이너가 줄바꿈 없이 자식 ${parent.childElementCount}개를 한 줄에 배치합니다.`
      })
    }
  }

  if (nodeWhiteSpace === 'nowrap' || nodeWhiteSpace === 'pre') {
    suggestions.push({
      hint: 'nowrap-text',
      target: 'node',
      declarations: {
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'white-space': 'nowrap',
        'min-width': '0'
      },
      reason: `white-space: ${nodeWhiteSpace} 텍스트가 줄바꿈 없이 박스를 넘칩니다. 말줄임 처리 또는 white-space: normal 이 필요합니다.`
    })
  } else if (metrics.mode === 'content') {
    suggestions.push({
      hint: 'unbreakable-text',
      target: 'node',
      declarations: { 'overflow-wrap': 'anywhere' },
      reason: '공백 없는 긴 문자열(URL, 토큰 등)이 줄바꿈 지점을 찾지 못합니다.'
    })
  }

  if (!inFlexRow && metrics.mode === 'box' && !MEDIA_TAGS.has(node.tag)) {
    suggestions.push({
      hint: 'fixed-width',
      target: 'node',
      declarations: { 'max-width': '100%', 'box-sizing': 'border-box' },
      reason: `요소 너비(${Math.round(metrics.nodeWidth)}px)가 부모 콘텐츠 너비(${Math.round(metrics.parentContentWidth)}px)를 초과합니다. 고정 너비 또는 padding 합산을 의심하세요.`
    })
  }

  return suggestions
}

/** 페이지 전체 가로 스크롤을 유발하거나 24px 이상 넘치면 high */
export const classifySeverity = (overflowPx: number, causesPageScroll: boolean): Severity => {
  if (overflowPx >= 24 || causesPageScroll) return 'high'
  if (overflowPx >= 8) return 'medium'
  return 'low'
}
