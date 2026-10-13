import { posix } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import type { AtRule, ChildNode, Container, Declaration, Rule } from 'postcss'
import postcssScss from 'postcss-scss'

/**
 * 런타임 결함 노드(클래스, data-ia-src 라인)를 SFC 소스의 정확한 위치로 되돌린다.
 * - 템플릿: Vite 플러그인이 주입한 라인 번호 주변 스니펫
 * - 스타일: SCSS 중첩(&, 하위 선택자)을 펼친 뒤 노드 클래스를 "대상"으로 하는 규칙의 라인
 *   (Vue SFC 의 <style> 블록, React 가 import 하는 .css/.scss/.module.* 파일)
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
  /** 규칙이 있는 프로젝트 상대 파일. 패치는 이 파일을 대상으로 한다 */
  file: string
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

interface CssSource {
  file: string
  lang: string
  scoped: boolean
  /** css 의 1번째 라인이 파일의 몇 번째 라인인지 - 1 (SFC <style> 블록용) */
  lineOffset: number
}

const locateInCss = (css: string, wanted: Set<string>, source: CssSource): StyleRuleMatch[] => {
  const matches: StyleRuleMatch[] = []
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
          file: source.file,
          selector,
          line: (child.source?.start?.line ?? 1) + source.lineOffset,
          endLine: (child.source?.end?.line ?? 1) + source.lineOffset,
          lang: source.lang,
          scoped: source.scoped,
          atRules,
          declarations: child.nodes.filter(isDeclaration).map(
            (declaration): StyleDeclaration => ({
              property: declaration.prop,
              value: declaration.value,
              line: (declaration.source?.start?.line ?? 1) + source.lineOffset
            })
          ),
          score
        })
        break
      }
      walk(child, selectors, atRules)
    })
  }
  walk(postcssScss.parse(css), [], [])
  return matches
}

const byScore = (a: StyleRuleMatch, b: StyleRuleMatch): number => b.score - a.score || a.line - b.line

export const locateStyleRules = (sfcContent: string, classes: string[], filename = 'component.vue'): StyleRuleMatch[] => {
  if (classes.length === 0) return []
  const { descriptor } = parseSfc(sfcContent, { filename })
  const wanted = new Set(classes)
  return descriptor.styles
    .flatMap((block): StyleRuleMatch[] =>
      // 스타일 블록 content의 1번째 라인 = <style> 태그가 있는 라인
      locateInCss(block.content, wanted, {
        file: filename,
        lang: block.lang ?? 'css',
        scoped: block.scoped === true,
        lineOffset: block.loc.start.line - 1
      })
    )
    .sort(byScore)
}

/** 일반 .css/.scss (CSS Modules 포함) 파일에서 클래스를 대상으로 하는 규칙을 찾는다 */
export const locateStylesheetRules = (content: string, classes: string[], filename: string): StyleRuleMatch[] => {
  if (classes.length === 0) return []
  const lang = filename.endsWith('.scss') ? 'scss' : 'css'
  return locateInCss(content, new Set(classes), { file: filename, lang, scoped: false, lineOffset: 0 }).sort(byScore)
}

/** JSX/TSX 소스가 import 하는 스타일시트. module 이면 DOM 클래스가 해시되어 있다 */
export const cssImports = (source: string): Array<{ specifier: string; module: boolean }> =>
  Array.from(source.matchAll(/^\s*import\s+(?:[\w$*{}\s,]+\s+from\s+)?['"]([^'"]+\.(?:css|scss))['"]/gm), (match) => {
    const specifier = match[1] ?? ''
    return { specifier, module: /\.module\.(?:css|scss)$/.test(specifier) }
  })

/**
 * Vite 개발 서버의 CSS Modules 기본 이름 `_로컬이름_해시5_순번` 에서 로컬 이름을 되돌린다.
 * 해시 형식이 아닌(=모듈이 아닌 일반) 클래스는 그대로 돌려준다.
 */
export const moduleLocalName = (domClass: string): string => /^_(.+)_[\w-]{5}_\d+$/.exec(domClass)?.[1] ?? domClass

/**
 * 소스 파일에서 클래스를 대상으로 하는 스타일 규칙을 찾는다.
 * - Vue SFC: 같은 파일의 <style> 블록
 * - React(JSX/TSX): 상대 경로로 import 한 .css/.scss 파일. CSS Modules 는 DOM 클래스가 해시라서 로컬 이름으로 되돌려 찾는다
 * read 는 프로젝트 상대 경로의 파일을 읽는 함수다 (패키지는 파일 시스템 접근 정책을 모른다). 읽지 못한 스타일시트는 건너뛴다.
 */
export const locateSourceRules = async (
  file: string,
  content: string,
  classes: string[],
  read: (path: string) => Promise<string>
): Promise<StyleRuleMatch[]> => {
  if (!/\.(jsx|tsx)$/.test(file)) return locateStyleRules(content, classes, file)
  const rules: StyleRuleMatch[] = []
  for (const { specifier, module } of cssImports(content)) {
    // 패키지 스타일(node_modules)은 수정 대상이 아니다
    if (!specifier.startsWith('.')) continue
    const stylesheet = posix.join(posix.dirname(file), specifier)
    let css: string
    try {
      css = await read(stylesheet)
    } catch {
      continue
    }
    rules.push(...locateStylesheetRules(css, module ? classes.map(moduleLocalName) : classes, stylesheet))
  }
  return rules.sort(byScore)
}

/** 에이전트 프롬프트용 한 줄 요약: "L24 .card { display: flex; gap: 12px; }" */
export const formatRulesCompact = (rules: StyleRuleMatch[], baseFile?: string): string =>
  rules
    .map((rule): string => {
      const media = rule.atRules.length > 0 ? `${rule.atRules.join(' ')} ` : ''
      const body = rule.declarations.map((declaration): string => `${declaration.property}: ${declaration.value};`).join(' ')
      // 규칙이 기준 파일(템플릿 파일)이 아닌 별도 스타일시트에 있으면 파일을 앞에 붙인다
      const where = rule.file === baseFile ? '' : `${rule.file} `
      return `${where}L${rule.line} ${media}${rule.selector} { ${body} }`
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
