import type { DefectContextResponse, DefectSummary, PatchResponse } from './dashboard-client'

/** MCP 응답 텍스트 포맷터. 에이전트가 읽기 쉬우면서 토큰을 아끼는 형태를 유지한다 */

type Rule = DefectContextResponse['nodeRules'][number]

const formatRules = (title: string, rules: Rule[]): string => {
  if (rules.length === 0) return `${title}: (같은 파일에 없음)`
  const lines = rules.map((rule): string => {
    const media = rule.atRules.length > 0 ? `${rule.atRules.join(' ')} ` : ''
    const body = rule.declarations.map((declaration): string => `${declaration.property}: ${declaration.value};`).join(' ')
    return `  L${rule.line} ${media}${rule.selector} { ${body} }`
  })
  return `${title}:\n${lines.join('\n')}`
}

export const formatDefectList = (defects: DefectSummary[]): string => {
  if (defects.length === 0) return '조건에 맞는 결함이 없습니다.'
  return defects
    .map((defect): string => {
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(',') || '-'
      return `${defect.id} [${defect.severity}/${defect.status}] ${source} @${defect.viewport.width}px ${defect.metrics.mode} +${Math.round(defect.metrics.overflowPx)}px hints=${hints}`
    })
    .join('\n')
}

export const formatContext = (context: DefectContextResponse): string => {
  const sections = [
    `# 결함 ${context.defect.id}`,
    context.payload.summary,
    '',
    '## 런타임 페이로드',
    JSON.stringify({ node: context.payload.node, parent: context.payload.parent, suggestions: context.payload.suggestions }),
    '',
    `## 소스 (${context.file ?? '소스 위치 없음'})`
  ]
  if (context.template) sections.push('템플릿 (> 가 결함 노드):', context.template.text)
  if (context.outline) {
    const styles = context.outline.styleRanges
      .map((range): string => `<style lang="${range.lang}"${range.scoped ? ' scoped' : ''}> L${range.startLine}-${range.endLine}`)
      .join(', ')
    sections.push(`블록 위치: template L${context.outline.templateRange?.startLine}-${context.outline.templateRange?.endLine}, ${styles}`)
  }
  sections.push(
    formatRules('노드 규칙', context.nodeRules),
    formatRules('부모 규칙', context.parentRules),
    formatRules('자식 규칙', context.childRules),
    '',
    '## 패치 작성 지침',
    '- propose_patch 의 edits 는 파일 안에서 정확히 한 번 등장하는 oldText 와 바꿀 newText 쌍입니다.',
    '- 기존 SCSS 규칙(scoped, BEM 중첩)에 선언을 추가하는 최소 변경을 우선하세요. 템플릿 구조 변경은 최후의 수단입니다.',
    '- 원인이 자식에 있으면(예: nowrap 제목) 노드와 자식을 함께 고치세요. 적용 후 같은 뷰포트에서 재측정되며, 새 오버플로우가 생기면 자동 롤백됩니다.'
  )
  return sections.join('\n')
}

export const formatPatch = (patch: PatchResponse, dashboardUrl: string): string => {
  const lines = [`패치 ${patch.id} 상태: ${patch.status}`, `대상: ${patch.file}`]
  if (patch.verification) {
    lines.push(`재측정: ${patch.verification.verdict} (${Math.round(patch.verification.beforePx)}px → ${Math.round(patch.verification.afterPx)}px)`)
    for (const regression of patch.verification.regressions) {
      const source = regression.node.source ? `${regression.node.source.file}:${regression.node.source.line}` : regression.node.selector
      lines.push(`  회귀: ${source} ${regression.metrics.mode} +${Math.round(regression.metrics.overflowPx)}px`)
    }
  }
  if (patch.autoRolledBack) lines.push('검증 실패로 자동 롤백되었습니다. 원인을 다시 분석해 새 패치를 제안하세요.')
  if (patch.error) lines.push(`오류: ${patch.error}`)
  if (patch.status === 'proposed') {
    lines.push(`사람의 검토를 기다립니다: ${new URL(`/defects/${patch.defectId}`, dashboardUrl).toString()}`)
  }
  lines.push('', patch.diff)
  return lines.join('\n')
}
