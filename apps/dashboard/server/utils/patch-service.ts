import { applyEdits } from '@inspector-agent/core'
import type { PatchEdit } from '@inspector-agent/core'
import { measureDefect } from '@inspector-agent/verifier'
import { createTwoFilesPatch } from 'diff'
import type { Patch } from '../../shared/types/inspector'
import { getInspectorConfig } from './config'
import {
  backupProjectFile,
  hashContent,
  readProjectFile,
  restoreProjectFile,
  writeProjectFile
} from './project-files'
import { baselineKey, readStore, updateStore } from './store'

export interface ProposePatchInput {
  defectId: string
  file: string
  edits: PatchEdit[]
  rationale: string
  author?: 'agent' | 'rule' | 'human'
}

const createPatchId = (): string => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const wait = (ms: number): Promise<void> => new Promise((done): void => {
  setTimeout(done, ms)
})

/** 제안 단계: 파일을 건드리지 않고 편집이 유효한지만 확인해 Diff 와 함께 저장한다 */
export const proposePatch = async (input: ProposePatchInput): Promise<Patch> => {
  const store = await readStore()
  if (!store.defects[input.defectId]) {
    throw createError({ statusCode: 404, statusMessage: `결함을 찾을 수 없습니다: ${input.defectId}` })
  }
  const original = await readProjectFile(input.file)
  const applied = applyEdits(original, input.edits)
  if (!applied.ok) throw createError({ statusCode: 422, statusMessage: applied.error })

  const patch: Patch = {
    id: createPatchId(),
    defectId: input.defectId,
    file: input.file,
    edits: input.edits,
    rationale: input.rationale,
    author: input.author ?? 'agent',
    status: 'proposed',
    diff: createTwoFilesPatch(`a/${input.file}`, `b/${input.file}`, original, applied.content, '', '', { context: 3 }),
    originalHash: hashContent(original),
    createdAt: new Date().toISOString()
  }
  await updateStore((data): void => {
    data.patches[patch.id] = patch
  })
  return patch
}

const getPatchOrThrow = async (patchId: string): Promise<Patch> => {
  const patch = (await readStore()).patches[patchId]
  if (!patch) throw createError({ statusCode: 404, statusMessage: `패치를 찾을 수 없습니다: ${patchId}` })
  return patch
}

/**
 * 적용 → 재측정 → 판정. 검증에 실패하면 기본적으로 즉시 롤백한다.
 * "고쳤다는 주장"이 아니라 같은 뷰포트에서 다시 잰 수치로 성공 여부를 기록한다.
 */
export const applyPatch = async (patchId: string, options: { autoRollback?: boolean } = {}): Promise<Patch> => {
  const autoRollback = options.autoRollback ?? true
  const patch = await getPatchOrThrow(patchId)
  if (patch.status !== 'proposed') {
    throw createError({ statusCode: 409, statusMessage: `제안 상태의 패치만 적용할 수 있습니다 (현재: ${patch.status}).` })
  }
  const store = await readStore()
  const defect = store.defects[patch.defectId]
  if (!defect) throw createError({ statusCode: 404, statusMessage: '패치 대상 결함이 사라졌습니다.' })

  const original = await readProjectFile(patch.file)
  if (hashContent(original) !== patch.originalHash) {
    throw createError({ statusCode: 409, statusMessage: '제안 이후 파일이 바뀌었습니다. 컨텍스트를 다시 읽고 패치를 새로 제안하세요.' })
  }
  const applied = applyEdits(original, patch.edits)
  if (!applied.ok) throw createError({ statusCode: 422, statusMessage: applied.error })

  const config = getInspectorConfig()
  await backupProjectFile(patch.file, patch.id)
  await writeProjectFile(patch.file, applied.content)
  const appliedAt = new Date().toISOString()

  // 개발 서버 HMR 이 변경을 반영할 시간을 준 뒤 새 페이지로 다시 측정한다
  await wait(config.settleMs)
  const baseline = store.baselines[baselineKey(defect.url, defect.viewport.width)] ?? [defect]

  let next: Patch
  try {
    const verification = await measureDefect(defect, baseline, { executablePath: config.chromiumPath })
    const rollback = !verification.passed && autoRollback
    if (rollback) await restoreProjectFile(patch.file, patch.id)
    next = {
      ...patch,
      status: verification.passed ? 'verified' : 'failed',
      appliedAt,
      verification,
      autoRolledBack: rollback,
      rolledBackAt: rollback ? new Date().toISOString() : undefined
    }
  } catch (error) {
    // 측정 자체가 실패하면 결과를 알 수 없으므로 원복한다
    await restoreProjectFile(patch.file, patch.id)
    next = {
      ...patch,
      status: 'failed',
      appliedAt,
      autoRolledBack: true,
      rolledBackAt: new Date().toISOString(),
      error: `재측정 실패: ${(error as Error).message}`
    }
  }

  await updateStore((data): void => {
    data.patches[next.id] = next
    const target = data.defects[next.defectId]
    if (target) target.status = next.status === 'verified' ? 'resolved' : next.autoRolledBack ? 'open' : 'patched'
  })
  return next
}

export const rollbackPatch = async (patchId: string): Promise<Patch> => {
  const patch = await getPatchOrThrow(patchId)
  const appliedAndKept = (patch.status === 'verified' || patch.status === 'failed') && !patch.autoRolledBack
  if (!appliedAndKept) {
    throw createError({ statusCode: 409, statusMessage: '현재 파일에 반영되어 있는 패치만 롤백할 수 있습니다.' })
  }
  await restoreProjectFile(patch.file, patch.id)
  const next: Patch = { ...patch, status: 'rolled-back', rolledBackAt: new Date().toISOString() }
  await updateStore((data): void => {
    data.patches[next.id] = next
    const target = data.defects[next.defectId]
    if (target) target.status = 'open'
  })
  return next
}

export const rejectPatch = async (patchId: string): Promise<Patch> => {
  const patch = await getPatchOrThrow(patchId)
  if (patch.status !== 'proposed') {
    throw createError({ statusCode: 409, statusMessage: '제안 상태의 패치만 거절할 수 있습니다.' })
  }
  const next: Patch = { ...patch, status: 'rejected' }
  await updateStore((data): void => {
    data.patches[next.id] = next
  })
  return next
}
