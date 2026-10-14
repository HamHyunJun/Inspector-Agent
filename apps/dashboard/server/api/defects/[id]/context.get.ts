import type { DefectContext } from '../../../../shared/types/inspector'
import { withEngine } from '../../../utils/engine'

export default defineEventHandler((event): Promise<DefectContext> => {
  const id = getRouterParam(event, 'id') ?? ''
  return withEngine((engine) => engine.getContext(id))
})
