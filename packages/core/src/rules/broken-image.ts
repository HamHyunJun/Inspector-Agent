import { diagnoseBrokenImage } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 깨진 이미지: <img> 가 로드에 실패해(잘못된 경로, 404, 이미지가 아닌 응답) 빈 사각형이나 대체 텍스트만 보이는 경우.
 * 레이아웃은 멀쩡해서 수치 규칙으로는 안 잡히고, 코드에 src 가 있으니 읽어서는 알 수 없다. <picture> 는 화면 폭에 따라 다른 소스를 고르므로 뷰포트마다 다를 수 있다.
 * 아직 로드 중인 이미지(complete 가 false)나 src 가 없는 이미지는 대상이 아니다.
 */

/** 보고서에 싣는 주소는 이 길이까지만 자른다(data URI 가 페이로드를 부풀리지 않도록) */
const MAX_SRC_LENGTH = 120

/** 로드가 끝났는데 그릴 수 있는 이미지가 없는지. src 가 없으면(빈 문자열) 깨진 것이 아니다 */
export const isBrokenImage = (image: { complete: boolean; naturalWidth: number; currentSrc: string }): boolean =>
  image.complete && image.naturalWidth === 0 && image.currentSrc !== ''

export const detectBrokenImage = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const worst = new Map<string, OverflowDefect>()

  for (const element of elements) {
    if (!(element instanceof HTMLImageElement) || !isBrokenImage(element)) continue
    const style = styleOf(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    if (element.closest('svg, [data-ia-ignore], [hidden]') !== null) continue
    const parent = element.parentElement
    if (!parent) continue

    const rect = element.getBoundingClientRect()
    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x:broken-image', node.source, `${node.selector}::broken-image`, viewport.width)
    // overflowPx 는 깨진 이미지가 차지한 큰 변이고, 이미지가 로드되면 결함 자체가 사라진다. 소스 주소는 진단 설명에 싣는다
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'broken-image',
      overflowPx: Math.round(Math.max(rect.width, rect.height, 1) * 100) / 100,
      overflowRatio: 1,
      parentContentWidth: Math.round(parent.getBoundingClientRect().width * 100) / 100,
      nodeWidth: Math.round(rect.width * 100) / 100
    }
    if (worst.has(fingerprint)) continue
    worst.set(fingerprint, {
      id: createDefectId(url, fingerprint),
      fingerprint,
      kind: 'overflow-x',
      // 내용이 아예 안 보이므로 크기와 상관없이 가장 높게 본다
      severity: 'high',
      url,
      viewport,
      node,
      parent: snapshot(parent),
      metrics,
      suggestions: diagnoseBrokenImage(node, metrics, element.currentSrc.slice(0, MAX_SRC_LENGTH)),
      detectedAt
    })
  }
  return Array.from(worst.values())
}
