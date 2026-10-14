import type { OverflowDefect } from '../types'
import type { RuleContext } from './context'
import { isRendered, toDefects } from './finding'
import type { Finding } from './finding'

/**
 * 이미지 해상도 두 가지: 화면에 그려진 크기보다 원본이 작아 흐릿한 이미지, 필요보다 훨씬 커서 로딩만 느린 이미지.
 * 레이아웃은 멀쩡해 눈으로 봐야 알 수 있다. 화면 배율(devicePixelRatio)을 곱해 비교한다.
 */

/** 필요한 픽셀 수가 원본의 이 배수 이상이면 눈에 띄게 흐릿하다 */
const MIN_UPSCALE = 1.25
/** 원본이 이 너비(px) 이상이고 */
const MIN_OVERSIZED_PX = 800
/** 필요한 픽셀 수의 이 배수 이상이면 과대 이미지로 본다 */
const MIN_OVERSIZED_RATIO = 3
/** 이보다 작게 그려진 이미지(아이콘, 점)는 대상이 아니다 */
const MIN_RENDERED_PX = 48

/** 화면 배율까지 곱한 필요 너비에서 원본이 모자란 픽셀. 0 이면 선명하다 */
export const upscaleGapPx = (naturalWidth: number, renderedWidth: number, dpr: number): number => {
  const needed = renderedWidth * dpr
  return naturalWidth > 0 && needed / naturalWidth >= MIN_UPSCALE ? needed - naturalWidth : 0
}

/** 필요 너비를 크게 넘는 원본의 낭비 픽셀. 0 이면 적당하다 */
export const oversizedPx = (naturalWidth: number, renderedWidth: number, dpr: number): number => {
  const needed = renderedWidth * dpr
  return naturalWidth >= MIN_OVERSIZED_PX && needed > 0 && naturalWidth / needed >= MIN_OVERSIZED_RATIO ? naturalWidth - needed : 0
}

export const detectImageQuality = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf } = context
  const dpr = window.devicePixelRatio || 1
  const findings: Finding[] = []
  for (const element of elements) {
    if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth === 0) continue
    if (/\.svg(\?|#|$)|^data:image\/svg/i.test(element.currentSrc) || !isRendered(element, styleOf)) continue
    const style = styleOf(element)
    if (style.imageRendering === 'pixelated' || style.imageRendering === 'crisp-edges') continue
    const rendered = element.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    if (rendered < MIN_RENDERED_PX) continue

    const blurry = upscaleGapPx(element.naturalWidth, rendered, dpr)
    if (blurry > 0) {
      findings.push({
        element,
        mode: 'blurry-image',
        px: blurry,
        detail: `이미지 원본 ${element.naturalWidth}px 를 ${Math.round(rendered)}px(화면 배율 ${dpr}배, 필요 ${Math.round(rendered * dpr)}px)로 늘려 그려 흐릿함`,
        suggestions: [{ hint: 'image-resolution', target: 'node', declarations: {}, reason: `원본(${element.naturalWidth}px)이 필요한 크기(${Math.round(rendered * dpr)}px)보다 작아 흐릿합니다. 더 큰 원본을 쓰거나 srcset 으로 배율별 이미지를 제공하세요.` }]
      })
    }
    const wasted = oversizedPx(element.naturalWidth, rendered, dpr)
    if (wasted > 0) {
      findings.push({
        element,
        mode: 'oversized-image',
        px: wasted,
        severity: 'low',
        detail: `이미지 원본 ${element.naturalWidth}px 를 ${Math.round(rendered)}px 로만 그려 필요 이상으로 큼(로딩 낭비)`,
        suggestions: [{ hint: 'image-resolution', target: 'node', declarations: {}, reason: `원본(${element.naturalWidth}px)이 필요한 크기(${Math.round(rendered * dpr)}px)의 ${MIN_OVERSIZED_RATIO}배 이상이라 내려받기만 느립니다. 줄인 이미지나 srcset/sizes 를 쓰세요.` }]
      })
    }
  }
  return toDefects(context, findings)
}
