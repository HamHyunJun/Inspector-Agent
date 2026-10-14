import { withEngine } from '../../../utils/engine'

export default defineEventHandler(async (event): Promise<{ deleted: string }> => {
  const id = getRouterParam(event, 'id') ?? ''
  await withEngine((engine) => engine.deletePatch(id))
  return { deleted: id }
})
