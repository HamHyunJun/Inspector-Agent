import type { PatchEdit } from './types'

export type ApplyEditsResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle === '') return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * 검색/치환 편집을 순서대로 적용한다.
 * 각 oldText는 적용 시점의 내용에서 정확히 한 번만 등장해야 하며, 하나라도 실패하면 전체를 거부한다.
 */
export const applyEdits = (content: string, edits: PatchEdit[]): ApplyEditsResult => {
  if (edits.length === 0) return { ok: false, error: '편집 항목이 비어 있습니다.' }
  let next = content
  for (const [index, edit] of edits.entries()) {
    const occurrences = countOccurrences(next, edit.oldText)
    if (occurrences === 0) {
      return { ok: false, error: `편집 #${index + 1}: oldText를 파일에서 찾을 수 없습니다.` }
    }
    if (occurrences > 1) {
      return { ok: false, error: `편집 #${index + 1}: oldText가 ${occurrences}번 등장합니다. 주변 문맥을 더 포함해 유일하게 만드세요.` }
    }
    next = next.replace(edit.oldText, (): string => edit.newText)
  }
  return { ok: true, content: next }
}
