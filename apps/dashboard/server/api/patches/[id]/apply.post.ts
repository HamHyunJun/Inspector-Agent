import type { Patch } from '../../../../shared/types/inspector'
import { withEngine } from '../../../utils/engine'

/** 사람이 승인한 패치를 파일에 반영하고 재측정한다. autoRollback=false 면 실패해도 파일을 유지한다 */
export default defineEventHandler(async (event): Promise<Patch> => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ autoRollback?: boolean } | undefined>(event).catch((): undefined => undefined)
  return withEngine((engine) => engine.applyPatch(id, { autoRollback: body?.autoRollback }))
})
