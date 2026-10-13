import { buildDeclarationPatch } from '@inspector-agent/source-locator'
import type { Patch } from '../../../../shared/types/inspector'
import { buildDefectContext } from '../../../utils/context'
import { findDuplicatePatch } from '../../../utils/patch-dedupe'
import { proposePatch } from '../../../utils/patch-service'
import { hashContent, readProjectFile } from '../../../utils/project-files'
import { readStore } from '../../../utils/store'

/**
 * 결정론적 진단의 n번째 제안을 그대로 소스 편집으로 바꿔 "기준선 패치"로 제안한다.
 * LLM 없이도 단순 결함은 고칠 수 있는지, 그리고 LLM 패치가 기준선보다 나은지 비교하는 데 쓴다.
 */
/** duplicated 가 true 면 새로 만들지 않고 이미 대기 중인 같은 패치를 돌려준 것이다 */
export default defineEventHandler(async (event): Promise<Patch & { duplicated: boolean }> => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ suggestionIndex?: number } | undefined>(event).catch((): undefined => undefined)
  const defect = (await readStore()).defects[id]
  if (!defect) throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${id}` })

  const suggestion = defect.suggestions[body?.suggestionIndex ?? 0]
  if (!suggestion) throw createError({ statusCode: 400, statusMessage: '해당 순번의 진단 제안이 없습니다.' })

  const context = await buildDefectContext(defect)
  if (!context.file) throw createError({ statusCode: 422, statusMessage: '소스 위치가 없어 패치를 만들 수 없습니다.' })
  if (suggestion.target === 'ancestor' || Object.keys(suggestion.declarations).length === 0) {
    throw createError({ statusCode: 422, statusMessage: '조상 요소 또는 구조 변경이 필요한 제안이라 규칙 기반 패치를 만들 수 없습니다.' })
  }
  if (suggestion.target === 'parent' && defect.parent.source?.file !== context.file) {
    throw createError({ statusCode: 422, statusMessage: '부모 요소가 다른 컴포넌트에 있어 규칙 기반 패치를 만들 수 없습니다.' })
  }

  const isNode = suggestion.target === 'node'
  const rules = isNode ? context.nodeRules : context.parentRules
  // 규칙이 별도 스타일시트(React)에 있으면 그 파일이 패치 대상이다. 규칙이 없으면 SFC 파일에 새 규칙을 추가한다
  const targetFile = rules[0]?.file ?? context.file
  const content = await readProjectFile(targetFile)
  const result = buildDeclarationPatch(
    content,
    rules.filter((rule): boolean => rule.file === targetFile),
    isNode ? defect.node.classes : defect.parent.classes,
    suggestion.declarations
  )
  if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.error })

  const existing = findDuplicatePatch(Object.values((await readStore()).patches), { defectId: defect.id, file: targetFile, edits: result.edits }, hashContent(content))
  if (existing) return { ...existing, duplicated: true }

  const patch = await proposePatch({
    defectId: defect.id,
    file: targetFile,
    edits: result.edits,
    rationale: `[규칙 기반 ${suggestion.hint}] ${suggestion.reason} → ${result.summary}`,
    author: 'rule'
  })
  return { ...patch, duplicated: false }
})
