/** 색 계산 도우미. 브라우저의 canvas 가 oklch, color-mix 같은 모든 CSS 색을 sRGB 로 바꿔 주므로 파서를 따로 만들지 않는다 */

export type Rgba = [number, number, number, number]
export type Rgb = [number, number, number]

let sampler: CanvasRenderingContext2D | undefined
const cache = new Map<string, Rgba>()

/** CSS 색 문자열을 sRGB [r,g,b,a(0~1)] 로 바꾼다. 해석할 수 없으면 투명으로 본다 */
export const parseColor = (value: string): Rgba => {
  const cached = cache.get(value)
  if (cached) return cached
  sampler ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true }) ?? undefined
  let result: Rgba = [0, 0, 0, 0]
  if (sampler) {
    sampler.clearRect(0, 0, 1, 1)
    sampler.fillStyle = '#000'
    sampler.fillStyle = value
    sampler.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0, a = 0] = sampler.getImageData(0, 0, 1, 1).data
    result = [r, g, b, Math.round((a / 255) * 1000) / 1000]
  }
  cache.set(value, result)
  return result
}

/** 앞색(fg, 알파 포함)을 뒷색(bg, 불투명) 위에 얹은 결과 */
export const composite = (fg: Rgba, bg: Rgb): Rgb => [0, 1, 2].map((index): number => Math.round(fg[index]! * fg[3] + bg[index]! * (1 - fg[3]))) as Rgb

const channel = (value: number): number => {
  const unit = value / 255
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

export const luminance = (color: Rgb): number => 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])

/** WCAG 대비 비율(1~21) */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y): number => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** 같은 색조를 유지한 채 뒷색과의 대비가 기준을 넘을 때까지 검정(밝은 배경) 또는 흰색(어두운 배경) 쪽으로 5% 씩 옮긴다 */
export const adjustToContrast = (fg: Rgb, bg: Rgb, required: number): Rgb => {
  const target: Rgb = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255]
  for (let step = 0; step <= 20; step++) {
    const mixed = [0, 1, 2].map((index): number => Math.round(fg[index]! + (target[index]! - fg[index]!) * (step / 20))) as Rgb
    if (contrastRatio(mixed, bg) >= required) return mixed
  }
  return target
}

export const toCss = (color: Rgb): string => `rgb(${color[0]}, ${color[1]}, ${color[2]})`

/**
 * 요소 뒤에 실제로 보이는 불투명 배경색. 배경 이미지·그라디언트가 끼어 있으면 알 수 없어 undefined.
 * `from` 요소 자신의 배경은 includeSelf 가 true 일 때만 본다(글자색 검사는 요소 자신의 배경 위에 그려지므로 true).
 */
export const backdropOf = (from: Element, styleOf: (element: Element) => CSSStyleDeclaration, includeSelf: boolean): Rgb | undefined => {
  const layers: Rgba[] = []
  for (let current: Element | null = includeSelf ? from : from.parentElement; current; current = current.parentElement) {
    const style = styleOf(current)
    if (style.backgroundImage !== 'none') return undefined
    const bg = parseColor(style.backgroundColor)
    if (bg[3] > 0) layers.push(bg)
    if (bg[3] >= 1) break
  }
  // 바깥(가장 불투명한 쪽)부터 안쪽으로 얹는다. 끝까지 불투명하지 않으면 캔버스 기본색(흰색) 위에 놓는다
  let base: Rgb = [255, 255, 255]
  for (const layer of layers.reverse()) base = composite(layer, base)
  return base
}
