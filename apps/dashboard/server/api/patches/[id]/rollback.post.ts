import type { Patch } from '../../../../shared/types/inspector'
import { rollbackPatch } from '../../../utils/patch-service'

export default defineEventHandler(async (event): Promise<Patch> => rollbackPatch(getRouterParam(event, 'id') ?? ''))
