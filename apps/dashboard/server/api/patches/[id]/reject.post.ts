import type { Patch } from '../../../../shared/types/inspector'
import { rejectPatch } from '../../../utils/patch-service'

export default defineEventHandler(async (event): Promise<Patch> => rejectPatch(getRouterParam(event, 'id') ?? ''))
