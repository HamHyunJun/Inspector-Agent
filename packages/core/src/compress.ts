import { formatSource } from './fingerprint'
import type { Defect, NodeSnapshot } from './types'

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

export const describeDefect = (defect: Defect): string => {
  const { metrics } = defect
  const subject = metrics.mode === 'box' ? '요소 박스' : '요소 내부 텍스트'
  return `${defect.viewport.width}px 뷰포트에서 부모 콘텐츠 너비 ${Math.round(metrics.parentContentWidth)}px, ${subject} 너비 ${Math.round(metrics.nodeWidth)}px로 ${Math.round(metrics.overflowPx)}px 가로 오버플로우`
}

export const toAgentPayload = (defect: Defect): AgentDefectPayload => {
  const parent = toNodePayload(defect.parent)
  return {
    id: defect.id,
    kind: `${defect.kind}/${defect.metrics.mode}`,
    viewport: `${defect.viewport.width}x${defect.viewport.height}`,
    summary: describeDefect(defect),
    node: dedupeInherited(toNodePayload(defect.node), parent),
    parent,
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
