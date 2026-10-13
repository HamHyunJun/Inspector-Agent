import { estimateTokens, toAgentPayload } from '@inspector-agent/core'
import { formatRulesCompact, locateStyleRules, outlineSfc, readSnippet } from '@inspector-agent/source-locator'
import type { DefectContext, StoredDefect } from '../../shared/types/inspector'
import { readProjectFile } from './project-files'

/**
 * 에이전트에게 줄 결함 컨텍스트를 만든다.
 * 런타임 수치(압축 페이로드) + 템플릿 해당 라인 주변 + 노드/부모 클래스를 대상으로 하는 SCSS 규칙 라인.
 */
export const buildDefectContext = async (defect: StoredDefect): Promise<DefectContext> => {
  const payload = toAgentPayload(defect)
  const file = defect.node.source?.file
  const base: DefectContext = {
    defect,
    payload,
    file,
    nodeRules: [],
    parentRules: [],
    childRules: [],
    tokens: { context: estimateTokens(JSON.stringify(payload)), rawFile: 0 }
  }
  if (!file) return base

  let content: string
  try {
    content = await readProjectFile(file)
  } catch {
    return base
  }

  const template = readSnippet(content, defect.node.source?.line ?? 1)
  const nodeRules = locateStyleRules(content, defect.node.classes, file)
  // 부모가 같은 파일에 정의된 경우에만 부모 규칙을 찾는다 (다른 컴포넌트 소속이면 파일이 다르다)
  const parentRules =
    defect.parent.source?.file === file ? locateStyleRules(content, defect.parent.classes, file) : []
  const nodeLines = new Set(nodeRules.map((rule): number => rule.line))
  const childRules = locateStyleRules(content, defect.node.childClasses ?? [], file).filter(
    (rule): boolean => !nodeLines.has(rule.line)
  )
  const context: Omit<DefectContext, 'tokens'> = {
    ...base,
    template,
    nodeRules,
    parentRules,
    childRules,
    outline: outlineSfc(content, file)
  }
  // 토큰 수는 MCP 가 실제로 에이전트에게 보내는 형태(압축 JSON + 스니펫 + 한 줄 규칙)로 계산한다
  const agentView = [
    JSON.stringify(payload),
    template.text,
    formatRulesCompact([...nodeRules, ...parentRules, ...childRules])
  ].join('\n')

  return {
    ...context,
    tokens: { context: estimateTokens(agentView), rawFile: estimateTokens(content) }
  }
}
