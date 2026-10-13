import type { FixSuggestion, FocusMetrics, NodeSnapshot, OcclusionMetrics, OverflowMetrics, Severity } from './types'

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

/**
 * 가려짐 결함의 원인별 후보 패치. 원인을 모르면(unknown) 단정하지 않고 빈 배열을 반환한다.
 * stacking-context-trap 은 선언만으로 고칠 수 없는 경우가 많아 declarations 가 비어 있고, 규칙 기반 자동 패치 대상이 아니다.
 */
export const diagnoseOcclusion = (node: NodeSnapshot, metrics: OcclusionMetrics): FixSuggestion[] => {
  const { cause, nodeLayer, occluderLayer, clippedBy } = metrics
  if (cause === 'stacking-context') {
    return [
      {
        hint: 'stacking-context-trap',
        target: 'ancestor',
        declarations: {},
        reason: `${nodeLayer.selector} 가 ${nodeLayer.reason} 로 만든 stacking context 안에 갇혀 있어, 안쪽 z-index 를 올려도 ${occluderLayer.selector}(z-index ${occluderLayer.zIndex ?? 'auto'}) 위로 올라가지 못합니다. 해당 조상의 ${nodeLayer.reason} 를 없애거나 팝업을 body 로 옮기세요(<Teleport to="body">).`
      }
    ]
  }
  if (cause === 'z-index') {
    const needsPosition = (node.styles.position ?? 'static') === 'static'
    return [
      {
        hint: 'z-index-too-low',
        target: 'node',
        declarations: { ...(needsPosition ? { position: 'relative' } : {}), 'z-index': String((occluderLayer.zIndex ?? 0) + 1) },
        reason: `같은 stacking context 에서 ${occluderLayer.selector}(z-index ${occluderLayer.zIndex ?? 'auto'}) 가 위에 그려집니다. z-index 를 ${(occluderLayer.zIndex ?? 0) + 1} 이상으로 올리세요.`
      }
    ]
  }
  if (cause === 'overflow-clip' && clippedBy) {
    return [
      {
        hint: 'overflow-clipped-popup',
        target: 'ancestor',
        declarations: { overflow: 'visible' },
        reason: `조상 ${clippedBy.selector} 의 overflow: ${clippedBy.overflow} 가 경계 밖 팝업을 잘라냅니다. overflow 를 풀거나 팝업을 body 로 옮기세요.`
      }
    ]
  }
  return []
}

/**
 * 포커스 이탈은 CSS 선언으로 고칠 수 없다. 키보드 이동을 가두는 동작(JS)이나 배경 비활성화가 필요해 declarations 는 비어 있다.
 * 도착 지점(escapedTo)이 body 이면 문서 처음이나 브라우저 UI 로 나간 것이다.
 */
export const diagnoseFocus = (metrics: FocusMetrics): FixSuggestion[] => {
  const where = metrics.escapedTo ? (metrics.escapedTo.tag === 'body' ? '문서/브라우저 UI' : metrics.escapedTo.selector) : '모달 밖'
  return [
    {
      hint: 'focus-trap-missing',
      target: 'node',
      declarations: {},
      reason: `모달에서 Tab 으로 ${where} 로 포커스가 빠져나갑니다. aria-modal 은 포커스를 가두지 않습니다. 마지막 요소에서 Tab 은 첫 요소로, 첫 요소에서 Shift+Tab 은 마지막 요소로 순환시키거나(keydown 핸들러), 모달 밖 영역에 inert 를 걸거나, 네이티브 <dialog>.showModal() 을 쓰세요. 닫을 때 열기 전 요소로 포커스를 돌려주세요.`
    }
  ]
}
