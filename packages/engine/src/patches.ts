import { applyEdits } from '@inspector-agent/core'
import type { PatchEdit } from '@inspector-agent/core'
import { buildDeclarationPatch } from '@inspector-agent/source-locator'
import { createTwoFilesPatch } from 'diff'
import { buildDefectContext } from './context'
import { findDuplicatePatch } from './dedupe'
import type { Env } from './env'
import { EngineError } from './errors'
import { assertDefectId, assertPatchId, createPatchId, own } from './ids'
import { selectDisposable } from './patch-cleanup'
import { hashContent } from './project-files'
import { baselineKey } from './store'
import type { Patch } from './types'

export interface ProposePatchInput {
  defectId: string
  file: string
  edits: PatchEdit[]
  rationale: string
  author?: 'agent' | 'rule' | 'human'
}

/** 에이전트가 승인 화면의 diff 를 속이는 데 쓸 수 있는 제어 문자(ANSI 이스케이프, 방향 제어 등). 탭·줄바꿈은 허용한다 */
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/

const wait = (ms: number): Promise<void> => new Promise((done): void => {
  setTimeout(done, ms)
})

/** 제안 단계: 파일을 건드리지 않고 편집이 유효한지만 확인해 Diff 와 함께 저장한다 */
export const proposePatch = async (env: Env, input: ProposePatchInput): Promise<Patch> => {
  assertDefectId(input.defectId)
  const store = await env.store.read()
  if (!own(store.defects, input.defectId)) throw new EngineError(`결함을 찾을 수 없습니다: ${input.defectId}`, 404)
  if (input.edits.some((edit): boolean => UNSAFE_TEXT.test(edit.oldText) || UNSAFE_TEXT.test(edit.newText))) {
    throw new EngineError('편집에 제어 문자가 들어 있어 승인 화면에서 내용을 속일 수 있습니다. 거부합니다.', 422)
  }
  const original = await env.files.read(input.file)
  const applied = applyEdits(original, input.edits)
  if (!applied.ok) throw new EngineError(applied.error, 422)

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
  await env.store.update((data): void => {
    data.patches[patch.id] = patch
  })
  return patch
}

export const getPatch = async (env: Env, patchId: string): Promise<Patch> => {
  assertPatchId(patchId)
  const patch = own((await env.store.read()).patches, patchId)
  if (!patch) throw new EngineError(`패치를 찾을 수 없습니다: ${patchId}`, 404)
  return patch
}

/**
 * 결정론적 진단의 n번째 제안을 그대로 소스 편집으로 바꿔 "기준선 패치"로 제안한다.
 * LLM 없이도 단순 결함은 고칠 수 있는지, 그리고 LLM 패치가 기준선보다 나은지 비교하는 데 쓴다.
 * duplicated 가 true 면 새로 만들지 않고 이미 대기 중인 같은 패치를 돌려준 것이다.
 */
export const proposeRulePatch = async (env: Env, defectId: string, suggestionIndex = 0): Promise<Patch & { duplicated: boolean }> => {
  assertDefectId(defectId)
  const store = await env.store.read()
  const defect = own(store.defects, defectId)
  if (!defect) throw new EngineError(`결함을 찾을 수 없습니다: ${defectId}`, 404)

  const suggestion = defect.suggestions[suggestionIndex]
  if (!suggestion) throw new EngineError('해당 순번의 진단 제안이 없습니다.', 400)

  const context = await buildDefectContext(env, defect)
  if (!context.file) throw new EngineError('소스 위치가 없어 패치를 만들 수 없습니다.', 422)
  if (suggestion.target === 'ancestor' || Object.keys(suggestion.declarations).length === 0) {
    throw new EngineError('조상 요소 또는 구조 변경이 필요한 제안이라 규칙 기반 패치를 만들 수 없습니다.', 422)
  }
  if (suggestion.target === 'parent' && defect.parent.source?.file !== context.file) {
    throw new EngineError('부모 요소가 다른 컴포넌트에 있어 규칙 기반 패치를 만들 수 없습니다.', 422)
  }

  const isNode = suggestion.target === 'node'
  const rules = isNode ? context.nodeRules : context.parentRules
  // 규칙이 별도 스타일시트(React)에 있으면 그 파일이 패치 대상이다. 규칙이 없으면 SFC 파일에 새 규칙을 추가한다
  const targetFile = rules[0]?.file ?? context.file
  const content = await env.files.read(targetFile)
  const result = buildDeclarationPatch(
    content,
    rules.filter((rule): boolean => rule.file === targetFile),
    isNode ? defect.node.classes : defect.parent.classes,
    suggestion.declarations
  )
  if (!result.ok) throw new EngineError(result.error, 422)

  const existing = findDuplicatePatch(Object.values(store.patches), { defectId: defect.id, file: targetFile, edits: result.edits }, hashContent(content))
  if (existing) return { ...existing, duplicated: true }

  const patch = await proposePatch(env, {
    defectId: defect.id,
    file: targetFile,
    edits: result.edits,
    rationale: `[규칙 기반 ${suggestion.hint}] ${suggestion.reason} → ${result.summary}`,
    author: 'rule'
  })
  return { ...patch, duplicated: false }
}

/**
 * 적용 → 재측정 → 판정. 검증에 실패하면 기본적으로 즉시 롤백한다.
 * "고쳤다는 주장"이 아니라 같은 뷰포트에서 다시 잰 수치로 성공 여부를 기록한다.
 * 한 번에 하나씩만 실행하고(serial), 파일을 쓰기 전에 실패할 수 있는 검사는 모두 끝낸다. 쓴 뒤에는 어떤 오류가 나도 상태를 기록한다.
 */
export const applyPatch = (env: Env, patchId: string, options: { autoRollback?: boolean } = {}): Promise<Patch> =>
  env.serial(async (): Promise<Patch> => {
    const autoRollback = options.autoRollback ?? true
    const patch = await getPatch(env, patchId)
    if (patch.status !== 'proposed') throw new EngineError(`제안 상태의 패치만 적용할 수 있습니다 (현재: ${patch.status}).`, 409)
    const store = await env.store.read()
    const defect = own(store.defects, patch.defectId)
    if (!defect) throw new EngineError('패치 대상 결함이 사라졌습니다.', 404)

    // 시나리오로 스캔한 결함은 같은 시나리오로 재측정해야 한다. 없으면 일반 화면을 재서 "고쳐졌다"고 잘못 판정하므로 파일을 쓰기 전에 거부한다
    const scenario = defect.scenarioKey ? own(store.scenarios, defect.scenarioKey) : undefined
    if (defect.scenarioKey && !scenario) {
      throw new EngineError(`이 결함을 스캔한 시나리오(${defect.scenarioKey})를 찾을 수 없어 재측정할 수 없습니다. 같은 시나리오로 다시 스캔하세요.`, 409)
    }
    const baseline = own(store.baselines, baselineKey(defect.url, defect.viewport.width, defect.scenarioKey)) ?? [defect]

    const original = await env.files.read(patch.file)
    if (hashContent(original) !== patch.originalHash) {
      throw new EngineError('제안 이후 파일이 바뀌었습니다. 컨텍스트를 다시 읽고 패치를 새로 제안하세요.', 409)
    }
    const applied = applyEdits(original, patch.edits)
    if (!applied.ok) throw new EngineError(applied.error, 422)

    await env.files.backup(patch.file, patch.id)
    await env.files.write(patch.file, applied.content)
    const appliedHash = hashContent(applied.content)
    const appliedAt = new Date().toISOString()

    /** 적용한 뒤 파일이 그대로일 때만 백업으로 되돌린다. 그 사이 사용자가 저장한 내용을 덮어쓰지 않는다 */
    const restoreIfUnchanged = async (): Promise<string | undefined> => {
      try {
        if (hashContent(await env.files.read(patch.file)) !== appliedHash) return '원복하려 했으나 그 사이 파일이 바뀌어 건드리지 않았습니다. 직접 확인하세요.'
        await env.files.restore(patch.file, patch.id)
        return undefined
      } catch (error) {
        return `원복에 실패했습니다: ${(error as Error).message}`
      }
    }

    let next: Patch
    try {
      // 개발 서버 HMR 이 변경을 반영할 시간을 준 뒤 새 페이지로 다시 측정한다
      await wait(env.config.settleMs)
      const verification = await env.deps.measure(defect, baseline, { executablePath: env.config.chromiumPath, scenario })
      const failure = !verification.passed && autoRollback ? await restoreIfUnchanged() : undefined
      const rolledBack = !verification.passed && autoRollback && failure === undefined
      next = {
        ...patch,
        status: verification.passed ? 'verified' : 'failed',
        appliedAt,
        appliedHash,
        verification,
        autoRolledBack: rolledBack,
        rolledBackAt: rolledBack ? new Date().toISOString() : undefined,
        error: failure
      }
    } catch (error) {
      // 측정 자체가 실패하면 결과를 알 수 없으므로 원복한다
      const failure = await restoreIfUnchanged()
      next = {
        ...patch,
        status: 'failed',
        appliedAt,
        appliedHash,
        autoRolledBack: failure === undefined,
        rolledBackAt: failure === undefined ? new Date().toISOString() : undefined,
        error: `재측정 실패: ${(error as Error).message}${failure ? ` / ${failure}` : ''}`
      }
    }

    await env.store.update((data): void => {
      data.patches[next.id] = next
      const target = own(data.defects, next.defectId)
      if (target) target.status = next.status === 'verified' ? 'resolved' : next.autoRolledBack ? 'open' : 'patched'
    })
    return next
  })

export const rollbackPatch = (env: Env, patchId: string): Promise<Patch> =>
  env.serial(async (): Promise<Patch> => {
    const patch = await getPatch(env, patchId)
    const appliedAndKept = (patch.status === 'verified' || patch.status === 'failed') && !patch.autoRolledBack
    if (!appliedAndKept) throw new EngineError('현재 파일에 반영되어 있는 패치만 롤백할 수 있습니다.', 409)
    // 적용한 뒤 파일이 더 바뀌었으면 백업으로 덮어쓰면 그 변경이 사라진다
    if (patch.appliedHash && hashContent(await env.files.read(patch.file)) !== patch.appliedHash) {
      throw new EngineError('패치를 적용한 뒤 파일이 더 수정되어, 롤백하면 이후 변경이 사라집니다. 직접 되돌리세요.', 409)
    }
    await env.files.restore(patch.file, patch.id)
    const next: Patch = { ...patch, status: 'rolled-back', rolledBackAt: new Date().toISOString() }
    await env.store.update((data): void => {
      data.patches[next.id] = next
      const target = own(data.defects, next.defectId)
      if (target) target.status = 'open'
    })
    return next
  })

export const rejectPatch = async (env: Env, patchId: string): Promise<Patch> => {
  const patch = await getPatch(env, patchId)
  if (patch.status !== 'proposed') throw new EngineError('제안 상태의 패치만 거절할 수 있습니다.', 409)
  const next: Patch = { ...patch, status: 'rejected', rejectedAt: new Date().toISOString() }
  await env.store.update((data): void => {
    data.patches[next.id] = next
  })
  return next
}

/** 처리가 끝난 패치(거절·롤백·자동 롤백된 실패)를 일괄 삭제하고 지운 개수를 돌려준다 */
export const pruneDisposablePatches = async (env: Env, options: { olderThanMs?: number; defectId?: string } = {}): Promise<number> => {
  const targets = await env.store.update((data): Patch[] => {
    const selected = selectDisposable(Object.values(data.patches), options)
    for (const patch of selected) delete data.patches[patch.id]
    return selected
  })
  await Promise.all(targets.map((patch): Promise<void> => env.files.removeBackup(patch.id)))
  return targets.length
}
