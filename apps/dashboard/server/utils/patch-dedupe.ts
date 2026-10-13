import type { PatchEdit } from '@inspector-agent/core'
import type { Patch } from '../../shared/types/inspector'

const sameEdits = (a: PatchEdit[], b: PatchEdit[]): boolean =>
  a.length === b.length && a.every((edit, index): boolean => edit.oldText === b[index]?.oldText && edit.newText === b[index]?.newText)

/**
 * 같은 결함에 같은 파일·같은 편집이 아직 대기 중(proposed)인 패치를 찾는다.
 * 제안 이후 파일이 바뀌었으면(originalHash 불일치) 그 패치는 적용 시 충돌이므로 중복으로 보지 않는다.
 */
export const findDuplicatePatch = (
  patches: Patch[],
  input: { defectId: string; file: string; edits: PatchEdit[] },
  currentHash: string
): Patch | undefined =>
  patches.find(
    (patch): boolean =>
      patch.status === 'proposed' &&
      patch.defectId === input.defectId &&
      patch.file === input.file &&
      patch.originalHash === currentHash &&
      sameEdits(patch.edits, input.edits)
  )
