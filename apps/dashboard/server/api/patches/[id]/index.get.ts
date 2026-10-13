import type { Patch } from '../../../../shared/types/inspector'
import { readStore } from '../../../utils/store'

export default defineEventHandler(async (event): Promise<Patch> => {
  const id = getRouterParam(event, 'id') ?? ''
  const patch = (await readStore()).patches[id]
  if (!patch) throw createError({ statusCode: 404, statusMessage: `패치를 찾을 수 없습니다: ${id}` })
  return patch
})
