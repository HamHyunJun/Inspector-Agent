import type { StyleRuleMatch } from './index'

export interface DeclarationPatchEdit {
  oldText: string
  newText: string
}

export type DeclarationPatchResult =
  | { ok: true; edits: DeclarationPatchEdit[]; summary: string }
  | { ok: false; error: string }

const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? ''

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 한 줄에 다른 선언이나 닫는 중괄호가 함께 있어도 그 속성의 값만 바꾼다 */
const replaceValue = (line: string, property: string, value: string): string =>
  line.replace(new RegExp(`(^|[{;\\s])${escapeRegExp(property)}(\\s*:\\s*)[^;}]*`), (_match, before: string): string => `${before}${property}: ${value}`)

/** 마지막 선언이 세미콜론 없이 끝나면(`color: red }`, 마지막 줄 생략) 뒤에 선언을 붙일 수 있게 세미콜론을 보충한다 */
const withTrailingSemicolon = (text: string): string => (/[^;{}\s]\s*$/.test(text) ? `${text.trimEnd()};` : text)

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
        updated[index] = replaceValue(updated[index] ?? '', property, value)
      } else {
        appended.push(`${property}: ${value};`)
      }
    }
    if (appended.length > 0) {
      const lastIndex = updated.length - 1
      const lastLine = updated[lastIndex] ?? ''
      const closing = rule.endLine === lastDeclarationLine ? lastLine.lastIndexOf('}') : -1
      if (closing >= 0) {
        // 한 줄 규칙(`.a { x: y; }`)이나 닫는 중괄호가 마지막 선언 줄에 붙은 규칙: 중괄호 앞에 끼워 넣는다
        updated[lastIndex] = `${withTrailingSemicolon(lastLine.slice(0, closing).trimEnd())} ${appended.join(' ')} ${lastLine.slice(closing)}`
      } else {
        updated[lastIndex] = withTrailingSemicolon(lastLine)
        updated.push(...appended.map((declaration): string => `${declarationIndent}${declaration}`))
      }
    }
    const newText = updated.join('\n')
    if (newText === oldText) return { ok: false, error: '이미 같은 선언이 적용되어 있습니다.' }
    return { ok: true, edits: [{ oldText, newText }], summary: `${rule.selector} (L${rule.line}) 규칙 수정` }
  }

  const className = classes.find((name): boolean => !name.startsWith('data-v-'))
  if (!className) return { ok: false, error: '대상 노드에 클래스가 없어 규칙을 만들 수 없습니다.' }
  const closingTags = content.match(/<\/style>/g) ?? []
  if (closingTags.length !== 1) return { ok: false, error: '일치하는 기존 규칙이 없고, 스타일 블록이 정확히 하나인 SFC 가 아니라서 새 규칙을 추가할 수 없습니다.' }
  const body = entries.map(([property, value]): string => `  ${property}: ${value};`).join('\n')
  return {
    ok: true,
    edits: [{ oldText: '</style>', newText: `\n.${className} {\n${body}\n}\n</style>` }],
    summary: `.${className} 규칙 신규 추가`
  }
}
