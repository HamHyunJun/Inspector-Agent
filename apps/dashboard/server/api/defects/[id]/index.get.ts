import type { Patch, StoredDefect } from '../../../../shared/types/inspector'
import { readStore } from '../../../utils/store'

export default defineEventHandler(async (event): Promise<{ defect: StoredDefect; patches: Patch[] }> => {
  const id = getRouterParam(event, 'id') ?? ''
  const store = await readStore()
  const defect = store.defects[id]
  if (!defect) throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${id}` })
  const patches = Object.values(store.patches)
    .filter((patch): boolean => patch.defectId === id)
    .sort((a, b): number => b.createdAt.localeCompare(a.createdAt))
  return { defect, patches }
})
