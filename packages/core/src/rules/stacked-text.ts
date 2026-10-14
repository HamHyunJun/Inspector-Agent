import { classifySeverity, diagnoseStackedText } from '../diagnose'
import { ownText } from '../dom-utils'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 글자 세로 쪼개짐: 칸이 너무 좁아 단어가 한두 글자씩 줄바꿈되어 세로로 서 버리는 경우(예: "주문내역" 이 주/문/내/역 네 줄).
 * 넘침도 잘림도 없고 글은 다 보이지만 읽을 수 없다. 줄 수가 아니라 "한 줄에 평균 몇 글자인지"로 정상 줄바꿈과 구분한다.
 */

/** 공백을 뺀 글자가 이만큼은 있어야 단어가 쪼개졌다고 본다 */
const MIN_CHARS = 4
/** 이 줄 수 이상으로 나뉘어야 한다(두 줄은 정상적인 줄바꿈일 수 있다) */
const MIN_LINES = 3
/** 한 줄 평균 글자 수가 이 값 이하면 세로로 선 것으로 본다 */
const MAX_AVG_CHARS_PER_LINE = 2
/** 글자마다 레이아웃 좌표를 읽으므로 긴 글은 제외한다. 긴 글이 한두 글자씩 서는 경우는 칸 폭이 이미 거의 0 이라 다른 규칙에도 걸린다 */
const MAX_TEXT_LENGTH = 60
/** 한 번 스캔에서 시험할 요소 수 상한 */
const MAX_CANDIDATES = 300
/** 같은 줄로 보는 세로 좌표 오차(px) */
const SAME_LINE_PX = 2

/** 글줄 수와 평균 글자 수로 세로로 쪼개졌는지 판정한다 */
export const isStackedText = (charCount: number, lineCount: number): boolean =>
  charCount >= MIN_CHARS && lineCount >= MIN_LINES && charCount / lineCount <= MAX_AVG_CHARS_PER_LINE

/** 글자 하나하나의 세로 위치로 글줄 수와 글자 수를 센다(공백은 제외) */
const countLines = (node: Text): { chars: number; lines: number } => {
  const text = node.textContent ?? ''
  const tops: number[] = []
  let chars = 0
  const range = document.createRange()
  for (let index = 0; index < text.length; index++) {
    if (/\s/.test(text[index]!)) continue
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    chars++
    if (!tops.some((top): boolean => Math.abs(top - rect.top) <= SAME_LINE_PX)) tops.push(rect.top)
  }
  return { chars, lines: tops.length }
}

export const detectStackedText = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const worst = new Map<string, OverflowDefect>()
  let tested = 0

  for (const element of elements) {
    if (tested >= MAX_CANDIDATES) break
    const text = ownText(element)
    if (text.length < MIN_CHARS || text.length > MAX_TEXT_LENGTH) continue
    const style = styleOf(element)
    // 세로 쓰기는 글자가 세로로 서는 것이 정상이다
    if (style.display === 'none' || style.visibility === 'hidden' || !style.writingMode.startsWith('horizontal')) continue
    if (element.closest('svg, [data-ia-ignore], [hidden], [aria-hidden="true"]') !== null) continue
    const parent = element.parentElement
    if (!parent) continue

    tested++
    let chars = 0
    let lines = 0
    element.childNodes.forEach((child): void => {
      if (child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim() === '') return
      const counted = countLines(child as Text)
      chars += counted.chars
      lines = Math.max(lines, counted.lines)
    })
    if (!isStackedText(chars, lines)) continue

    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x:stacked-text', node.source, `${node.selector}::stacked-text`, viewport.width)
    const stackedPx = (lines - 1) * lineHeight
    const current = worst.get(fingerprint)
    if (current && current.metrics.overflowPx >= stackedPx) continue
    // parentContentWidth 는 이 모드에서만 줄 수, nodeWidth 는 한 줄 평균 글자 수를 뜻한다
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'stacked-text',
      overflowPx: Math.round(stackedPx * 100) / 100,
      overflowRatio: Math.round((1 / (chars / lines)) * 1000) / 1000,
      parentContentWidth: lines,
      nodeWidth: Math.round((chars / lines) * 100) / 100
    }
    worst.set(fingerprint, {
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-x',
      severity: classifySeverity(metrics.overflowPx, false),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseStackedText(node, metrics),
      detectedAt
    })
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
