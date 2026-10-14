import type { Patch } from '../../../shared/types/inspector'
import { withEngine } from '../../utils/engine'

export default defineEventHandler((event): Promise<Patch[]> => {
  const { defectId } = getQuery(event) as { defectId?: string }
  return withEngine((engine) => engine.listPatches(defectId))
})
