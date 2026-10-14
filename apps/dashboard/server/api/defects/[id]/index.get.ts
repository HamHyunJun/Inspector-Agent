import type { DefectDetail } from '@inspector-agent/engine'
import { withEngine } from '../../../utils/engine'

export default defineEventHandler((event): Promise<DefectDetail> => {
  const id = getRouterParam(event, 'id') ?? ''
  return withEngine((engine) => engine.getDefectDetail(id))
})
