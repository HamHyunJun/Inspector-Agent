import type { DefectStatus, StoredDefect } from '../../../shared/types/inspector'
import { withEngine } from '../../utils/engine'

export default defineEventHandler((event): Promise<StoredDefect[]> => {
  const { status } = getQuery(event) as { status?: DefectStatus }
  return withEngine((engine) => engine.listDefects(status))
})
