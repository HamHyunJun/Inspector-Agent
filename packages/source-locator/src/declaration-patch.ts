import type { StyleRuleMatch } from './index'

export interface DeclarationPatchEdit {
  oldText: string
  newText: string
}

export type DeclarationPatchResult =
  | { ok: true; edits: DeclarationPatchEdit[]; summary: string }
  | { ok: false; error: string }

const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? ''

/**
 * 규칙 기반 진단 결과(선언 묶음)를 SFC 소스 편집으로 바꾼다.
 * - 대상 클래스를 스타일링하는 기존 규칙이 있으면: 같은 속성은 값만 바꾸고, 없는 속성은 마지막 선언 뒤에 추가
 * - 없으면: 첫 번째 스타일 블록 끝에 새 규칙을 추가
 * LLM 없이 만드는 "기준선 패치"이며, 결과는 반드시 재측정으로 검증한다.
 */
export const buildDeclarationPatch = (
  content: string,
  rules: StyleRuleMatch[],
  classes: string[],
  declarations: Record<string, string>
): DeclarationPatchResult => {
  const entries = Object.entries(declarations)
  if (entries.length === 0) return { ok: false, error: '추가할 선언이 없습니다.' }
  const lines = content.split('\n')
  // @media 안의 규칙보다 기본 규칙을 우선한다
  const rule = rules.find((candidate): boolean => candidate.atRules.length === 0) ?? rules[0]

  if (rule) {
    const lastDeclarationLine = rule.declarations.reduce(
      (max, declaration): number => Math.max(max, declaration.line),
      rule.line
    )
    const blockLines = lines.slice(rule.line - 1, lastDeclarationLine)
    const oldText = blockLines.join('\n')
    const declarationIndent =
      rule.declarations.length > 0
        ? indentOf(lines[(rule.declarations[0]?.line ?? rule.line) - 1] ?? '')
        : `${indentOf(lines[rule.line - 1] ?? '')}  `

    const updated = [...blockLines]
    const appended: string[] = []
    for (const [property, value] of entries) {
      const existing = rule.declarations.find((declaration): boolean => declaration.property === property)
      if (existing) {
        const index = existing.line - rule.line
        updated[index] = `${indentOf(updated[index] ?? '')}${property}: ${value};`
      } else {
        appended.push(`${declarationIndent}${property}: ${value};`)
      }
    }
    const newText = [...updated, ...appended].join('\n')
    if (newText === oldText) return { ok: false, error: '이미 같은 선언이 적용되어 있습니다.' }
    return { ok: true, edits: [{ oldText, newText }], summary: `${rule.selector} (L${rule.line}) 규칙 수정` }
  }

  const className = classes.find((name): boolean => !name.startsWith('data-v-'))
  if (!className) return { ok: false, error: '대상 노드에 클래스가 없어 규칙을 만들 수 없습니다.' }
  const closingTags = content.match(/<\/style>/g) ?? []
  if (closingTags.length !== 1) return { ok: false, error: '스타일 블록이 정확히 하나일 때만 새 규칙을 추가할 수 있습니다.' }
  const body = entries.map(([property, value]): string => `  ${property}: ${value};`).join('\n')
  return {
    ok: true,
    edits: [{ oldText: '</style>', newText: `\n.${className} {\n${body}\n}\n</style>` }],
    summary: `.${className} 규칙 신규 추가`
  }
}
