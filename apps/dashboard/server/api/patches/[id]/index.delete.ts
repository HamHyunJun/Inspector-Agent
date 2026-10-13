import { deletePatch } from '../../../utils/patch-service'

export default defineEventHandler(async (event): Promise<{ deleted: string }> => {
  const id = getRouterParam(event, 'id') ?? ''
  await deletePatch(id)
  return { deleted: id }
})
