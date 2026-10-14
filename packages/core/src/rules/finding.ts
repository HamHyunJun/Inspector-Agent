import { classifySeverity } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { FixSuggestion, OverflowDefect, OverflowMetrics, OverflowMode, Severity } from '../types'
import type { RuleContext } from './context'

/**
 * 규칙이 "어디가 무엇 때문에 얼마나 나쁜가"만 돌려주면 결함 객체 조립·같은 소스 중복 제거·정렬을 여기서 한다.
 * 수치(px)는 고치면 0 이 되는 양이어야 한다. 패치 후 재측정은 이 값이 사라졌는지로 판정한다.
 */
export interface Finding {
  element: Element
  mode: OverflowMode
  px: number
  /** "~가 ~해서 ~함" 처럼 뷰포트 접두어 뒤에 붙는 한 줄 설명 */
  detail: string
  suggestions: FixSuggestion[]
  /** 생략하면 px 크기로 정한다 */
  severity?: Severity
  /** 같은 요소에서 같은 모드가 여러 종류 나올 때 구분하는 값 */
  key?: string
}

const round2 = (value: number): number => Math.round(value * 100) / 100

export const toDefects = (context: RuleContext, findings: Finding[]): OverflowDefect[] => {
  const { snapshot, viewport, url, detectedAt } = context
  const worst = new Map<string, OverflowDefect>()
  for (const finding of findings) {
    const parent = finding.element.parentElement ?? document.body
    const node = snapshot(finding.element)
    const fingerprint = createFingerprint(`overflow-x:${finding.mode}`, node.source, `${node.selector}::${finding.mode}${finding.key ? `:${finding.key}` : ''}`, viewport.width)
    const current = worst.get(fingerprint)
    if (current && current.metrics.overflowPx >= finding.px) continue
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: finding.mode,
      overflowPx: round2(finding.px),
      overflowRatio: 0,
      parentContentWidth: round2(parent.getBoundingClientRect().width),
      nodeWidth: round2(finding.element.getBoundingClientRect().width),
      detail: finding.detail
    }
    worst.set(fingerprint, {
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-x',
      severity: finding.severity ?? classifySeverity(metrics.overflowPx, false),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: finding.suggestions,
      detectedAt
    })
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}

/** 화면에 실제로 그려지는 요소인지(숨김·접힘·장식 제외). 규칙들이 같은 기준을 쓰도록 모았다 */
export const isRendered = (element: Element, styleOf: (element: Element) => CSSStyleDeclaration): boolean => {
  for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) {
    const style = styleOf(current)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
  }
  return element.closest('svg, [data-ia-ignore], [hidden], [inert], [aria-hidden="true"]') === null
}
