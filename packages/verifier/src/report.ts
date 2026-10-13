import { formatMagnitude } from '@inspector-agent/core'
import type { Defect, ScanResult, Severity } from '@inspector-agent/core'

/** CLI 의 종료 코드/요약 로직. 브라우저 없이 테스트할 수 있도록 cli.ts 에서 분리했다 */

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 }
const SEVERITY_LABEL: Record<Severity, string> = { high: '🔴 high', medium: '🟠 medium', low: '🟡 low' }

export const parseFailOn = (value: string | undefined): Severity | undefined => {
  if (value === undefined) return undefined
  if (value === 'high' || value === 'medium' || value === 'low') return value
  throw new Error(`--fail-on 은 high, medium, low 중 하나여야 합니다 (받은 값: ${value || '없음'})`)
}

/** 기준(threshold) 이상의 심각도를 가진 결함. high 이면 high 만, low 이면 전부 */
export const defectsAtOrAbove = (results: ScanResult[], threshold: Severity): Defect[] =>
  results.flatMap((result): Defect[] => result.defects.filter((defect): boolean => SEVERITY_RANK[defect.severity] >= SEVERITY_RANK[threshold]))

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

const locationOf = (defect: Defect): string =>
  defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector

/** GitHub job summary 에 붙일 마크다운. 결함이 없으면 한 줄만 남긴다 */
export const renderMarkdown = (url: string, results: ScanResult[], failOn: Severity | undefined, scenarioName?: string): string => {
  const total = results.reduce((sum, result): number => sum + result.defects.length, 0)
  const failing = failOn ? defectsAtOrAbove(results, failOn).length : 0
  const verdict = failOn ? (failing > 0 ? `❌ 실패: \`${failOn}\` 이상 ${failing}건` : `✅ 통과: \`${failOn}\` 이상 없음`) : '(통과/실패 기준 없음)'
  const lines = ['## Inspector-Agent 레이아웃 스캔', '', `- 대상: ${url}`, ...(scenarioName ? [`- 시나리오: ${scenarioName}`] : []), `- 뷰포트: ${results.map((result): string => `${result.viewport.width}px`).join(', ')}`, `- 결함: ${total}건 · ${verdict}`]
  if (total === 0) return `${lines.join('\n')}\n\n결함이 없습니다. ✅\n`

  lines.push('', '| 뷰포트 | 심각도 | 위치 | 종류 | 크기 | 진단 |', '| --- | --- | --- | --- | --- | --- |')
  for (const result of results) {
    for (const defect of result.defects) {
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(', ') || '-'
      lines.push(
        `| ${result.viewport.width}px | ${SEVERITY_LABEL[defect.severity]} | \`${cell(locationOf(defect))}\` | ${defect.kind} | ${cell(formatMagnitude(defect))} | ${cell(hints)} |`
      )
    }
  }
  return `${lines.join('\n')}\n`
}
