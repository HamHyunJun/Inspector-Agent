import type { DefectGroupMember, Patch, StoredDefect } from '../../../../shared/types/inspector'
import { readStore } from '../../../utils/store'

export default defineEventHandler(async (event): Promise<{ defect: StoredDefect; patches: Patch[]; sameLocation: DefectGroupMember[] }> => {
  const id = getRouterParam(event, 'id') ?? ''
  const store = await readStore()
  const defect = store.defects[id]
  if (!defect) throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${id}` })
  const patches = Object.values(store.patches)
    .filter((patch): boolean => patch.defectId === id)
    .sort((a, b): number => b.createdAt.localeCompare(a.createdAt))
  // 같은 소스 위치·뷰포트(같은 fingerprint)라서 이 결함을 고치면 같이 사라질 다른 URL 의 결함
  const sameLocation = Object.values(store.defects)
    .filter((other): boolean => other.id !== id && other.fingerprint === defect.fingerprint)
    .map((other): DefectGroupMember => ({ id: other.id, url: other.url, status: other.status }))
  return { defect, patches, sameLocation }
})
