import { withEngine } from '../../utils/engine'

/** 처리가 끝난 패치를 일괄 삭제한다. defectId 를 주면 그 결함의 것만 지운다 */
export default defineEventHandler(async (event): Promise<{ deleted: number }> => {
  const body = await readBody<{ defectId?: string } | undefined>(event).catch((): undefined => undefined)
  return { deleted: await withEngine((engine) => engine.prune({ defectId: body?.defectId })) }
})
