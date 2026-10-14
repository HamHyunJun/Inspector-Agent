import { classifySeverity, diagnoseSquished } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 찌그러짐: flex 줄 안의 아이콘·이미지·원형 배지가 공간이 모자라 한쪽 축으로만 줄어들어 비율이 깨지는 경우
 * (예: 24×24 원형 아이콘이 18×24 타원이 됨). 넘침도 잘림도 없어서 다른 규칙으로는 잡히지 않는다.
 * 요소의 flex-shrink 를 잠깐 0 으로 바꿔 "줄어들지 않았다면 이 크기였을 것"을 재고, 실제와 비교한 뒤 원래 값으로 되돌린다.
 */

/** 서브픽셀 반올림에 반응하지 않도록 이보다 적게 줄면 무시한다 */
const MIN_SQUISH_PX = 2
/** 원래 크기의 이 비율 이상 줄어야 한다 */
const MIN_SQUISH_RATIO = 0.05
/** shortcut: 아이콘·아바타·배지 크기(이 값 이하)만 본다. 큰 이미지 카드의 줄어듦은 다른 규칙과 겹치고 측정 비용이 커서 제외한다, 큰 이미지가 찌그러지는 사례가 나오면 올린다 */
const MAX_BOX_PX = 240
/** 한 번 스캔에서 시험할 후보 수 상한. 후보마다 레이아웃을 다시 계산하므로 비용을 묶어 둔다 */
const MAX_CANDIDATES = 300
const MEDIA_TAGS = new Set(['img', 'svg', 'video', 'canvas', 'picture'])

interface Size {
  width: number
  height: number
}

/**
 * 줄어들기 전(natural)과 실제(actual) 크기로 찌그러진 양(px)을 구한다. 0 이면 정상.
 * 한 축만 줄고 다른 축은 그대로여야 찌그러짐이다. 텍스트가 줄바꿈되면 다른 축이 함께 변하므로 대상이 아니다.
 */
export const squishPx = (natural: Size, actual: Size): number => {
  const widthLoss = natural.width - actual.width
  const heightLoss = natural.height - actual.height
  const width = widthLoss >= MIN_SQUISH_PX && widthLoss / natural.width >= MIN_SQUISH_RATIO && Math.abs(heightLoss) < 1 ? widthLoss : 0
  const height = heightLoss >= MIN_SQUISH_PX && heightLoss / natural.height >= MIN_SQUISH_RATIO && Math.abs(widthLoss) < 1 ? heightLoss : 0
  return Math.max(width, height)
}

const isFlexParent = (display: string): boolean => display === 'flex' || display === 'inline-flex'

export const detectSquished = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const found: OverflowDefect[] = []
  let tested = 0

  for (const element of elements) {
    if (tested >= MAX_CANDIDATES) break
    const parent = element.parentElement
    if (!parent || !isFlexParent(styleOf(parent).display)) continue
    const style = styleOf(element)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.flexShrink) <= 0) continue
    const tag = element.tagName.toLowerCase()
    // 텍스트 상자는 공간이 모자라면 줄바꿈하는 것이 정상이다. 글이 없는 시각 요소(아이콘, 이미지, 원형 배지)만 본다
    if (!MEDIA_TAGS.has(tag) && (element.textContent ?? '').trim() !== '') continue
    if (tag !== 'svg' && element.closest('svg') !== null) continue
    if (element.closest('[data-ia-ignore]') !== null) continue

    const actual = element.getBoundingClientRect()
    // 거의 0px 까지 줄어든 아이콘도 대상이다(보이지 않을 만큼 찌그러진 것이 가장 심하다). 처음부터 보이지 않는 요소와 큰 상자만 뺀다
    if ((actual.width < 4 && actual.height < 4) || actual.width > MAX_BOX_PX || actual.height > MAX_BOX_PX) continue

    tested++
    const previous = { value: element.style.getPropertyValue('flex-shrink'), priority: element.style.getPropertyPriority('flex-shrink') }
    element.style.setProperty('flex-shrink', '0', 'important')
    const natural = element.getBoundingClientRect()
    if (previous.value === '') element.style.removeProperty('flex-shrink')
    else element.style.setProperty('flex-shrink', previous.value, previous.priority)

    if (natural.width < 4 && natural.height < 4) continue
    const squished = squishPx(natural, actual)
    if (squished === 0) continue

    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x', node.source, `${node.selector}::squished`, viewport.width)
    // parentContentWidth 는 이 모드에서만 "줄어들기 전 너비"를 뜻한다
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'squished',
      overflowPx: Math.round(squished * 100) / 100,
      overflowRatio: Math.round((squished / Math.max(natural.width, natural.height)) * 1000) / 1000,
      parentContentWidth: Math.round(natural.width * 100) / 100,
      nodeWidth: Math.round(actual.width * 100) / 100
    }
    found.push({
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-x',
      severity: classifySeverity(metrics.overflowPx, false),
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseSquished(node, metrics),
      detectedAt
    })
  }
  return found.sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
