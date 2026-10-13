import type { Patch } from '../../../shared/types/inspector'
import { readStore } from '../../utils/store'

export default defineEventHandler(async (event): Promise<Patch[]> => {
  const { defectId } = getQuery(event) as { defectId?: string }
  const { patches } = await readStore()
  return Object.values(patches)
    .filter((patch): boolean => !defectId || patch.defectId === defectId)
    .sort((a, b): number => b.createdAt.localeCompare(a.createdAt))
})
