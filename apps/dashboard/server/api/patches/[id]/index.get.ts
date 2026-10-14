import type { Patch } from '../../../../shared/types/inspector'
import { withEngine } from '../../../utils/engine'

export default defineEventHandler((event): Promise<Patch> => {
  const id = getRouterParam(event, 'id') ?? ''
  return withEngine((engine) => engine.getPatch(id))
})
