import type { PatchEdit } from '@inspector-agent/core'
import type { Patch } from '../../../shared/types/inspector'
import { proposePatch } from '../../utils/patch-service'

interface ProposeBody {
  defectId?: string
  file?: string
  edits?: PatchEdit[]
  rationale?: string
  author?: 'agent' | 'rule' | 'human'
}

const isValidEdit = (edit: PatchEdit): boolean => typeof edit?.oldText === 'string' && typeof edit?.newText === 'string'

export default defineEventHandler(async (event): Promise<Patch> => {
  const body = await readBody<ProposeBody>(event)
  if (!body?.defectId || !body.file || !Array.isArray(body.edits) || !body.edits.every(isValidEdit)) {
    throw createError({ statusCode: 400, statusMessage: 'defectId, file, edits[{oldText,newText}] 가 필요합니다.' })
  }
  return proposePatch({
    defectId: body.defectId,
    file: body.file,
    edits: body.edits,
    rationale: body.rationale ?? '',
    author: body.author
  })
})
