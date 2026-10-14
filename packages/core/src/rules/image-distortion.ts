import { classifySeverity, diagnoseImageDistortion } from '../diagnose'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 이미지 비율 왜곡: <img> 가 원본 비율과 다른 박스에 object-fit: fill(기본값)로 그려져 가로나 세로로 늘어나 보이는 경우
 * (예: 160×90 사진을 width: 100% + 높이 96px 로 그림). 넘침도 잘림도 없고 레이아웃이 멀쩡해 코드만 봐서는 알기 어렵다.
 * flex 줄에서 줄어들어 비율이 깨진 이미지는 찌그러짐 규칙의 몫이라 detector 가 중복을 걸러 낸다.
 */

/** 원본 비율과 이 비율 이상 다르면 눈에 띄게 늘어난 것으로 본다 */
const MIN_DISTORTION_RATIO = 0.06
/** 서브픽셀 반올림에 반응하지 않도록 이보다 적게 어긋나면 무시한다 */
const MIN_DISTORTION_PX = 3
/** 이보다 작은 이미지(점, 트래킹 픽셀)는 제외한다 */
const MIN_BOX_PX = 16
/** object-fit 이 이 값이면 박스에 맞춰 늘리지 않으므로 왜곡이 아니다 */
const KEEPS_RATIO = new Set(['cover', 'contain', 'none', 'scale-down'])

interface Size {
  width: number
  height: number
}

/**
 * 원본(natural)과 화면에 그려진(rendered) 콘텐츠 크기로 늘어난 양(px)을 구한다. 0 이면 정상.
 * 가로를 기준으로 원본 비율에 맞는 높이를 구해 실제 높이와의 차이를 돌려준다(height: auto 로 고치면 0 이 되는 양).
 */
export const distortionPx = (natural: Size, rendered: Size): number => {
  if (natural.width <= 0 || natural.height <= 0 || rendered.width <= 0 || rendered.height <= 0) return 0
  const expectedHeight = (rendered.width * natural.height) / natural.width
  const diff = Math.abs(rendered.height - expectedHeight)
  return diff >= MIN_DISTORTION_PX && diff / expectedHeight >= MIN_DISTORTION_RATIO ? diff : 0
}

export const detectImageDistortion = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const worst = new Map<string, OverflowDefect>()

  for (const element of elements) {
    if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth === 0) continue
    // SVG 는 고유 비율이 없거나 뷰박스에 맞춰 그려지므로 래스터 이미지만 본다
    if (/\.svg(\?|#|$)|^data:image\/svg/i.test(element.currentSrc)) continue
    const style = styleOf(element)
    if (style.display === 'none' || style.visibility === 'hidden' || KEEPS_RATIO.has(style.objectFit)) continue
    if (element.closest('svg, [data-ia-ignore]') !== null) continue
    const parent = element.parentElement
    if (!parent) continue

    const rect = element.getBoundingClientRect()
    const inset = (side: string): number => parseFloat(style.getPropertyValue(`padding-${side}`)) + parseFloat(style.getPropertyValue(`border-${side}-width`))
    const rendered = { width: rect.width - inset('left') - inset('right'), height: rect.height - inset('top') - inset('bottom') }
    if (rendered.width < MIN_BOX_PX || rendered.height < MIN_BOX_PX) continue
    const px = distortionPx({ width: element.naturalWidth, height: element.naturalHeight }, rendered)
    if (px === 0) continue

    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x:distorted', node.source, `${node.selector}::distorted`, viewport.width)
    const current = worst.get(fingerprint)
    if (current && current.metrics.overflowPx >= px) continue
    // parentContentWidth 는 이 모드에서만 "원본 가로 세로 비율에 맞는 그려진 높이"를 뜻한다
    const expectedHeight = (rendered.width * element.naturalHeight) / element.naturalWidth
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'distorted',
      overflowPx: Math.round(px * 100) / 100,
      overflowRatio: Math.round((px / expectedHeight) * 1000) / 1000,
      parentContentWidth: Math.round(expectedHeight * 100) / 100,
      nodeWidth: Math.round(rendered.height * 100) / 100
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
      suggestions: diagnoseImageDistortion(node, metrics),
      detectedAt
    })
  }
  return Array.from(worst.values()).sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
