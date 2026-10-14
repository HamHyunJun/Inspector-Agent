import type { Patch } from '../../../../shared/types/inspector'
import { withEngine } from '../../../utils/engine'

/** 결정론적 진단의 n번째 제안을 "기준선 패치"로 제안한다. duplicated 가 true 면 이미 대기 중인 같은 패치를 돌려준 것이다 */
export default defineEventHandler(async (event): Promise<Patch & { duplicated: boolean }> => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ suggestionIndex?: number } | undefined>(event).catch((): undefined => undefined)
  return withEngine((engine) => engine.proposeRulePatch(id, body?.suggestionIndex))
})
