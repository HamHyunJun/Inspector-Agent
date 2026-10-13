import { parse as parseSfc } from '@vue/compiler-sfc'
import type { AtRule, ChildNode, Container, Declaration, Rule } from 'postcss'
import postcssScss from 'postcss-scss'

/**
 * 런타임 결함 노드(클래스, data-ia-src 라인)를 SFC 소스의 정확한 위치로 되돌린다.
 * - 템플릿: Vite 플러그인이 주입한 라인 번호 주변 스니펫
 * - 스타일: SCSS 중첩(&, 하위 선택자)을 펼친 뒤 노드 클래스를 "대상"으로 하는 규칙의 라인
 */

export interface SourceSnippet {
  startLine: number
  endLine: number
  /** "  12 | <p class=...>" 형식, 기준 라인은 '>' 로 표시 */
  text: string
}

export interface StyleDeclaration {
  property: string
  value: string
  line: number
}

export interface StyleRuleMatch {
  /** 중첩을 펼친 최종 셀렉터 */
  selector: string
  /** 파일 기준 1-based 라인 */
  line: number
  endLine: number
  lang: string
  scoped: boolean
  /** 규칙을 감싼 @media 등 at-rule 조건 */
  atRules: string[]
  declarations: StyleDeclaration[]
  /** 대상 compound에 포함된 노드 클래스 수 (높을수록 정확) */
  score: number
}

export const readSnippet = (content: string, line: number, radius = 6): SourceSnippet => {
  const lines = content.split('\n')
  const startLine = Math.max(1, line - radius)
  const endLine = Math.min(lines.length, line + radius)
  const width = String(endLine).length
  const text = lines
    .slice(startLine - 1, endLine)
    .map((code, index): string => {
      const current = startLine + index
      const marker = current === line ? '>' : ' '
      return `${marker} ${String(current).padStart(width, ' ')} | ${code}`
    })
    .join('\n')
  return { startLine, endLine, text }
}

const splitSelectors = (selector: string): string[] =>
  selector
    .split(',')
    .map((part): string => part.trim())
    .filter((part): boolean => part !== '')

/** SCSS 중첩 셀렉터를 부모 셀렉터와 결합해 펼친다 */
export const resolveNestedSelector = (parentSelectors: string[], selector: string): string[] => {
  const own = splitSelectors(selector)
  if (parentSelectors.length === 0) return own
  const resolved: string[] = []
  for (const parent of parentSelectors) {
    for (const child of own) {
      resolved.push(child.includes('&') ? child.replace(/&/g, parent) : `${parent} ${child}`)
    }
  }
  return resolved
}

/** 셀렉터의 마지막 compound(실제로 스타일이 적용되는 대상)의 클래스 목록 */
export const subjectClasses = (selector: string): string[] => {
  const withoutPseudo = selector.replace(/::?[\w-]+(\([^)]*\))?/g, '')
  const compounds = withoutPseudo.split(/\s*[>+~]\s*|\s+/).filter((part): boolean => part !== '')
  const subject = compounds[compounds.length - 1] ?? ''
  return Array.from(subject.matchAll(/\.([\w-]+)/g), (match): string => match[1] ?? '')
}

const isRule = (node: ChildNode): node is Rule => node.type === 'rule'
const isAtRule = (node: ChildNode): node is AtRule => node.type === 'atrule'
const isDeclaration = (node: ChildNode): node is Declaration => node.type === 'decl'

export const locateStyleRules = (sfcContent: string, classes: string[], filename = 'component.vue'): StyleRuleMatch[] => {
  if (classes.length === 0) return []
  const { descriptor } = parseSfc(sfcContent, { filename })
  const wanted = new Set(classes)
  const matches: StyleRuleMatch[] = []

  for (const block of descriptor.styles) {
    const lang = block.lang ?? 'css'
    // 스타일 블록 content의 1번째 라인 = <style> 태그가 있는 라인
    const lineOffset = block.loc.start.line - 1
    const root = postcssScss.parse(block.content)

    const walk = (container: Container, parentSelectors: string[], atRules: string[]): void => {
      container.each((child): void => {
        if (isAtRule(child)) {
          walk(child, parentSelectors, [...atRules, `@${child.name} ${child.params}`.trim()])
          return
        }
        if (!isRule(child)) return
        const selectors = resolveNestedSelector(parentSelectors, child.selector)
        for (const selector of selectors) {
          const score = subjectClasses(selector).filter((name): boolean => wanted.has(name)).length
          if (score === 0) continue
          matches.push({
            selector,
            line: (child.source?.start?.line ?? 1) + lineOffset,
            endLine: (child.source?.end?.line ?? 1) + lineOffset,
            lang,
            scoped: block.scoped === true,
            atRules,
            declarations: child.nodes.filter(isDeclaration).map(
              (declaration): StyleDeclaration => ({
                property: declaration.prop,
                value: declaration.value,
                line: (declaration.source?.start?.line ?? 1) + lineOffset
              })
            ),
            score
          })
          break
        }
        walk(child, selectors, atRules)
      })
    }

    walk(root, [], [])
  }

  return matches.sort((a, b): number => b.score - a.score || a.line - b.line)
}

/** 에이전트 프롬프트용 한 줄 요약: "L24 .card { display: flex; gap: 12px; }" */
export const formatRulesCompact = (rules: StyleRuleMatch[]): string =>
  rules
    .map((rule): string => {
      const media = rule.atRules.length > 0 ? `${rule.atRules.join(' ')} ` : ''
      const body = rule.declarations.map((declaration): string => `${declaration.property}: ${declaration.value};`).join(' ')
      return `L${rule.line} ${media}${rule.selector} { ${body} }`
    })
    .join('\n')

export interface SfcOutline {
  templateRange?: { startLine: number; endLine: number }
  styleRanges: Array<{ startLine: number; endLine: number; lang: string; scoped: boolean }>
}

/** 에이전트가 파일 구조를 빠르게 파악하도록 블록 위치만 요약한다 */
export const outlineSfc = (sfcContent: string, filename = 'component.vue'): SfcOutline => {
  const { descriptor } = parseSfc(sfcContent, { filename })
  return {
    templateRange: descriptor.template
      ? { startLine: descriptor.template.loc.start.line, endLine: descriptor.template.loc.end.line }
      : undefined,
    styleRanges: descriptor.styles.map((block) => ({
      startLine: block.loc.start.line,
      endLine: block.loc.end.line,
      lang: block.lang ?? 'css',
      scoped: block.scoped === true
    }))
  }
}

export { buildDeclarationPatch } from './declaration-patch'
export type { DeclarationPatchEdit, DeclarationPatchResult } from './declaration-patch'
