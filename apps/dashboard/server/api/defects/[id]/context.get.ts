import type { DefectContext } from '../../../../shared/types/inspector'
import { buildDefectContext } from '../../../utils/context'
import { readStore } from '../../../utils/store'

export default defineEventHandler(async (event): Promise<DefectContext> => {
  const id = getRouterParam(event, 'id') ?? ''
  const defect = (await readStore()).defects[id]
  if (!defect) throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${id}` })
  return buildDefectContext(defect)
})
