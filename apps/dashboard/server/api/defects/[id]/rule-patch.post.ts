import { buildDeclarationPatch } from '@inspector-agent/source-locator'
import type { Patch } from '../../../../shared/types/inspector'
import { buildDefectContext } from '../../../utils/context'
import { proposePatch } from '../../../utils/patch-service'
import { readProjectFile } from '../../../utils/project-files'
import { readStore } from '../../../utils/store'

/**
 * 결정론적 진단의 n번째 제안을 그대로 소스 편집으로 바꿔 "기준선 패치"로 제안한다.
 * LLM 없이도 단순 결함은 고칠 수 있는지, 그리고 LLM 패치가 기준선보다 나은지 비교하는 데 쓴다.
 */
export default defineEventHandler(async (event): Promise<Patch> => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ suggestionIndex?: number } | undefined>(event).catch((): undefined => undefined)
  const defect = (await readStore()).defects[id]
  if (!defect) throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${id}` })

  const suggestion = defect.suggestions[body?.suggestionIndex ?? 0]
  if (!suggestion) throw createError({ statusCode: 400, statusMessage: '해당 순번의 진단 제안이 없습니다.' })

  const context = await buildDefectContext(defect)
  if (!context.file) throw createError({ statusCode: 422, statusMessage: '소스 위치가 없어 패치를 만들 수 없습니다.' })
  if (suggestion.target === 'parent' && defect.parent.source?.file !== context.file) {
    throw createError({ statusCode: 422, statusMessage: '부모 요소가 다른 컴포넌트에 있어 규칙 기반 패치를 만들 수 없습니다.' })
  }

  const content = await readProjectFile(context.file)
  const isNode = suggestion.target === 'node'
  const result = buildDeclarationPatch(
    content,
    isNode ? context.nodeRules : context.parentRules,
    isNode ? defect.node.classes : defect.parent.classes,
    suggestion.declarations
  )
  if (!result.ok) throw createError({ statusCode: 422, statusMessage: result.error })

  return proposePatch({
    defectId: defect.id,
    file: context.file,
    edits: result.edits,
    rationale: `[규칙 기반 ${suggestion.hint}] ${suggestion.reason} → ${result.summary}`,
    author: 'rule'
  })
})
