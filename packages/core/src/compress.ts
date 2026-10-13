import { formatSource } from './fingerprint'
import type { Defect, FocusMetrics, NodeSnapshot, OcclusionMetrics, StackingLayer } from './types'

/**
 * LLM에 전달할 결함 컨텍스트를 최소화한다.
 * 전체 DOM 대신 결함 노드와 직계 부모의 레이아웃 속성 차이, 수치, 소스 위치만 남긴다.
 */

export interface AgentNodePayload {
  tag: string
  classes?: string[]
  source?: string
  width: number
  styles: Record<string, string>
  text?: string
}

export interface AgentDefectPayload {
  id: string
  kind: string
  viewport: string
  summary: string
  node: AgentNodePayload
  parent: AgentNodePayload
  /** 오버플로우 결함에서만: 이 결함이 밀어낸 뒤쪽 형제(연쇄 결함). 원인을 고치면 같이 사라진다 */
  cascaded?: Array<{ selector: string; source?: string; overflowPx: number }>
  /** 포커스 이탈 결함에서만: 모달 판정 근거와 Tab 시험 결과 */
  focus?: {
    trigger: string
    focusableCount: number
    escapesForward: boolean
    escapesBackward: boolean
    tabsToEscape?: number
    escapedTo?: AgentNodePayload
  }
  /** 가려짐 결함에서만: 가린 요소와 stacking 비교 결과 */
  occlusion?: {
    occluder: AgentNodePayload
    cause: string
    nodeLayer: string
    occluderLayer: string
    clippedBy?: string
  }
  suggestions: Array<{ hint: string; target: string; css: string }>
}

const toNodePayload = (snapshot: NodeSnapshot): AgentNodePayload => ({
  tag: snapshot.tag,
  classes: snapshot.classes.length > 0 ? snapshot.classes : undefined,
  source: snapshot.source ? formatSource(snapshot.source) : undefined,
  width: Math.round(snapshot.rect.width),
  styles: snapshot.styles,
  text: snapshot.text
})

/** 부모와 값이 같은 상속성 속성은 자식에서 제거한다 (예: 둘 다 white-space: nowrap) */
const dedupeInherited = (node: AgentNodePayload, parent: AgentNodePayload): AgentNodePayload => {
  const inherited = ['white-space', 'word-break', 'overflow-wrap']
  const styles: Record<string, string> = {}
  for (const [property, value] of Object.entries(node.styles)) {
    if (inherited.includes(property) && parent.styles[property] === value) continue
    styles[property] = value
  }
  return { ...node, styles }
}

const describeLayer = (layer: StackingLayer): string =>
  `${layer.selector} (z-index ${layer.zIndex ?? 'auto'}, stacking context: ${layer.reason})`

const OCCLUSION_CAUSE_LABEL: Record<OcclusionMetrics['cause'], string> = {
  'stacking-context': '조상 stacking context 에 갇힘',
  'z-index': '같은 컨텍스트에서 z-index 가 낮음',
  'overflow-clip': '조상 overflow 에 잘림',
  unknown: '원인 미분류'
}

/** 결함의 크기 지표. 오버플로우는 넘친 px, 가려짐은 가려진 비율(0~1). 정렬과 재측정 비교에 쓴다 */
export const defectMagnitude = (defect: Defect): number => {
  if (defect.kind === 'occluded') return defect.metrics.coveredRatio
  // 포커스 이탈: 빠져나가는 방향 수 (0~2)
  if (defect.kind === 'focus-escape') return Number(defect.metrics.escapesForward) + Number(defect.metrics.escapesBackward)
  return defect.metrics.overflowPx
}

const describeFocusDirections = (metrics: FocusMetrics): string =>
  [metrics.escapesForward ? `Tab ${metrics.tabsToEscape ?? '?'}번째` : '', metrics.escapesBackward ? 'Shift+Tab' : ''].filter((part): boolean => part !== '').join(', ')

/** 목록에 한 줄로 보여 줄 크기 표기. 예: `box +251px`, `가려짐 100% (z-index)` */
export const formatMagnitude = (defect: Defect): string => {
  if (defect.kind === 'occluded') return `가려짐 ${Math.round(defect.metrics.coveredRatio * 100)}% (${defect.metrics.cause})`
  if (defect.kind === 'focus-escape') return `포커스 이탈 (${describeFocusDirections(defect.metrics)})`
  const cascade = defect.metrics.cascaded?.length ? ` · 연쇄 ${defect.metrics.cascaded.length}건` : ''
  return `${defect.metrics.mode} +${Math.round(defect.metrics.overflowPx)}px${cascade}`
}

export const describeDefect = (defect: Defect): string => {
  if (defect.kind === 'focus-escape') {
    const label = defect.node.classes[0] ? `.${defect.node.classes[0]}` : defect.node.tag
    return `${defect.viewport.width}px 뷰포트에서 모달 ${label} 이 열려 있는데 ${describeFocusDirections(defect.metrics)} 로 포커스가 모달 밖으로 빠져나감 (포커스 가능 요소 ${defect.metrics.focusableCount}개)`
  }
  if (defect.kind === 'occluded') {
    const { metrics } = defect
    const label = defect.node.classes[0] ? `.${defect.node.classes[0]}` : defect.node.tag
    return `${defect.viewport.width}px 뷰포트에서 ${label} 의 ${Math.round(metrics.coveredRatio * 100)}% 가 ${metrics.occluder.selector} 에 가려짐 (${OCCLUSION_CAUSE_LABEL[metrics.cause]})`
  }
  const { metrics } = defect
  const subject = metrics.mode === 'box' ? '요소 박스' : '요소 내부 텍스트'
  return `${defect.viewport.width}px 뷰포트에서 부모 콘텐츠 너비 ${Math.round(metrics.parentContentWidth)}px, ${subject} 너비 ${Math.round(metrics.nodeWidth)}px로 ${Math.round(metrics.overflowPx)}px 가로 오버플로우${metrics.cascaded?.length ? ` (이 결함이 밀어낸 연쇄 결함 ${metrics.cascaded.length}건 포함)` : ''}`
}

const payloadKind = (defect: Defect): string => {
  if (defect.kind === 'occluded') return `${defect.kind}/${defect.metrics.cause}`
  if (defect.kind === 'focus-escape') return `${defect.kind}/${defect.metrics.trigger}`
  return `${defect.kind}/${defect.metrics.mode}`
}

export const toAgentPayload = (defect: Defect): AgentDefectPayload => {
  const parent = toNodePayload(defect.parent)
  return {
    id: defect.id,
    kind: payloadKind(defect),
    viewport: `${defect.viewport.width}x${defect.viewport.height}`,
    summary: describeDefect(defect),
    node: dedupeInherited(toNodePayload(defect.node), parent),
    parent,
    occlusion:
      defect.kind === 'occluded'
        ? {
            occluder: toNodePayload(defect.metrics.occluder),
            cause: defect.metrics.cause,
            nodeLayer: describeLayer(defect.metrics.nodeLayer),
            occluderLayer: describeLayer(defect.metrics.occluderLayer),
            clippedBy: defect.metrics.clippedBy ? `${defect.metrics.clippedBy.selector} (overflow: ${defect.metrics.clippedBy.overflow})` : undefined
          }
        : undefined,
    cascaded:
      defect.kind === 'overflow-x' && defect.metrics.cascaded?.length
        ? defect.metrics.cascaded.map((item) => ({
            selector: item.selector,
            source: item.source ? formatSource(item.source) : undefined,
            overflowPx: Math.round(item.overflowPx)
          }))
        : undefined,
    focus:
      defect.kind === 'focus-escape'
        ? {
            trigger: defect.metrics.trigger,
            focusableCount: defect.metrics.focusableCount,
            escapesForward: defect.metrics.escapesForward,
            escapesBackward: defect.metrics.escapesBackward,
            tabsToEscape: defect.metrics.tabsToEscape,
            escapedTo: defect.metrics.escapedTo ? toNodePayload(defect.metrics.escapedTo) : undefined
          }
        : undefined,
    suggestions: defect.suggestions.map((suggestion) => ({
      hint: suggestion.hint,
      target: suggestion.target,
      css: Object.entries(suggestion.declarations)
        .map(([property, value]): string => `${property}: ${value};`)
        .join(' ')
    }))
  }
}

/**
 * 토큰 수 근사치. 영문/코드 기준 약 4자당 1토큰.
 * 정확한 수치가 필요하면 벤치마크에서 실제 토크나이저로 교체한다.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)
