import { formatMagnitude } from '@inspector-agent/core'
import type { DefectContextResponse, DefectListItem, PatchResponse } from './dashboard-client'

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

const MAX_LISTED_URLS = 5

export const formatDefectList = (defects: DefectListItem[]): string => {
  if (defects.length === 0) return '조건에 맞는 결함이 없습니다.'
  return defects
    .map((defect): string => {
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(',') || '-'
      const listed = defect.urls.slice(0, MAX_LISTED_URLS).join(',')
      const more = defect.urls.length > MAX_LISTED_URLS ? `,+${defect.urls.length - MAX_LISTED_URLS}` : ''
      return `${defect.id} [${defect.severity}/${defect.status}] ${source} @${defect.viewport.width}px ${formatMagnitude(defect)} hints=${hints} urls=${listed}${more}`
    })
    .join('\n')
}

export const formatContext = (context: DefectContextResponse): string => {
  const sections = [
    `# 결함 ${context.defect.id}`,
    context.payload.summary,
    '',
    '## 런타임 페이로드',
    JSON.stringify({ node: context.payload.node, parent: context.payload.parent, occlusion: context.payload.occlusion, focus: context.payload.focus, cascaded: context.payload.cascaded, suggestions: context.payload.suggestions }),
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
  if (context.payload.focus) {
    sections.push(
      '- 포커스 이탈 결함: CSS 로는 고칠 수 없습니다. 모달 안 keydown 핸들러로 Tab/Shift+Tab 을 순환시키거나 배경에 inert 를 거세요. aria-modal 만으로는 포커스가 갇히지 않습니다.',
      '- 재측정은 실제 Tab/Shift+Tab 을 눌러 포커스가 모달 안에 머무는지 확인하며, 두 방향 모두 0이어야 통과합니다.'
    )
  }
  if (context.payload.occlusion) {
    sections.push(
      '- 가려짐 결함: occlusion.cause 가 stacking-context 이면 z-index 를 올려도 소용없습니다. 갇힌 조상(nodeLayer)의 stacking context 원인을 없애거나 팝업을 body 로 옮기세요.',
      '- 가려짐은 재측정에서 가려진 비율이 0% 가 되어야 통과합니다(일부만 풀려도 실패).'
    )
  }
  return sections.join('\n')
}

export const formatPatch = (patch: PatchResponse, dashboardUrl: string): string => {
  const lines = [`패치 ${patch.id} 상태: ${patch.status}`, `대상: ${patch.file}`]
  if (patch.verification) {
    const { beforePx, afterPx, unit } = patch.verification
    const measured =
      unit === 'ratio'
        ? `${Math.round(beforePx * 100)}% → ${Math.round(afterPx * 100)}%`
        : unit === 'count'
          ? `${beforePx}방향 → ${afterPx}방향`
          : `${Math.round(beforePx)}px → ${Math.round(afterPx)}px`
    lines.push(`재측정: ${patch.verification.verdict} (${measured})`)
    for (const regression of patch.verification.regressions) {
      const source = regression.node.source ? `${regression.node.source.file}:${regression.node.source.line}` : regression.node.selector
      lines.push(`  회귀: ${source} ${formatMagnitude(regression)}`)
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
