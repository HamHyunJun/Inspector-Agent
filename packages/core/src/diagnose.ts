import type { ClippedTextMetrics, FixSuggestion, FocusMetrics, NodeSnapshot, OcclusionMetrics, OverflowMetrics, Severity, VerticalOverflowMetrics } from './types'

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

/** 24px 이상 넘치면 high, 8px 이상이면 medium (가로 오버플로우와 같은 기준) */
export const classifyVerticalSeverity = (overflowPx: number): Severity => {
  if (overflowPx >= 24) return 'high'
  if (overflowPx >= 8) return 'medium'
  return 'low'
}

/** 글자의 30% 이상이 사라지면 high(내용을 읽을 수 없음), 10% 이상이면 medium */
export const classifyClippedSeverity = (hiddenRatio: number): Severity => {
  if (hiddenRatio >= 0.3) return 'high'
  if (hiddenRatio >= 0.1) return 'medium'
  return 'low'
}

/**
 * 세로 오버플로우의 후보 패치. 고정 높이를 늘어나게 바꾸는 것이 기본이고, 높이가 의도된 것이면 스크롤 영역으로 만든다.
 * 현재 높이를 min-height 로 남겨 다른 화면 크기에서 레이아웃이 줄어드는 일을 막는다.
 */
export const diagnoseVertical = (node: NodeSnapshot, metrics: VerticalOverflowMetrics): FixSuggestion[] => {
  const where = metrics.culprit ? `${metrics.culprit.selector} 가` : '콘텐츠가'
  return [
    {
      hint: 'fixed-height',
      target: 'node',
      declarations: { height: 'auto', 'min-height': `${Math.round(metrics.containerHeight)}px` },
      reason: `컨테이너 높이(${Math.round(metrics.containerHeight)}px)가 고정이라 ${where} 아래로 ${Math.round(metrics.overflowPx)}px 넘쳐 다음 요소와 겹칩니다. 높이를 콘텐츠에 맞게 늘어나게 하세요(height: auto + min-height).`
    },
    {
      hint: 'vertical-scroll',
      target: 'node',
      declarations: { 'overflow-y': 'auto' },
      reason: `높이를 유지해야 한다면 넘치는 ${Math.round(metrics.overflowPx)}px 를 스크롤로 보여 주세요(overflow-y: auto). ${node.selector} 는 지금 overflow: visible 이라 넘친 내용이 그대로 겹쳐 보입니다.`
    }
  ]
}

/**
 * 텍스트 잘림의 후보 패치. 한 줄 라벨이면 말줄임으로 잘린 것을 드러내고, 내용이 중요하면 줄바꿈해서 다 보여 준다.
 * text-overflow: ellipsis 는 줄바꿈 없는 한 줄(white-space: nowrap)에서만 동작한다.
 */
/** 위치를 정하는 CSS 는 앵커마다 달라 선언만으로 고치기 어려우므로 declarations 를 비워 규칙 기반 자동 패치 대상에서 뺀다 */
export const diagnoseViewportEscape = (_node: NodeSnapshot, metrics: OverflowMetrics): FixSuggestion[] => [
  {
    hint: 'keep-in-viewport',
    target: 'node',
    declarations: {},
    reason: `절대/고정 위치 요소가 화면 밖으로 ${Math.round(metrics.overflowPx)}px 나가 일부가 보이지 않습니다. 너비를 뷰포트 안으로 제한(max-width: calc(100vw - 2rem))하고, 앵커 기준 한쪽 정렬(right: 0 / left: 0)이 좁은 화면에서 반대편으로 나가지 않게 작은 화면에서는 left/right 를 뷰포트 여백에 맞추거나 position: fixed 로 바꾸세요.`
  }
]

export const diagnoseClippedText = (_node: NodeSnapshot, metrics: ClippedTextMetrics): FixSuggestion[] => {
  const clippedPercent = Math.round(metrics.hiddenRatio * 100)
  const nowrap = metrics.whiteSpace === 'nowrap' || metrics.whiteSpace === 'pre'
  return [
    {
      hint: 'text-ellipsis',
      target: 'node',
      declarations: nowrap ? { 'text-overflow': 'ellipsis' } : { 'text-overflow': 'ellipsis', 'white-space': 'nowrap' },
      reason: `overflow 로 글자의 ${clippedPercent}%(${Math.round(metrics.clippedPx)}px)가 잘리는데 말줄임이 없어 잘린 줄 알 수 없습니다. text-overflow: ellipsis 로 잘렸음을 보여 주세요.`
    },
    {
      hint: 'text-wrap',
      target: 'node',
      declarations: { 'white-space': 'normal', 'overflow-wrap': 'anywhere' },
      reason: '내용을 모두 읽을 수 있어야 한다면 줄바꿈해서 다 보여 주세요(white-space: normal + overflow-wrap: anywhere).'
    }
  ]
}
