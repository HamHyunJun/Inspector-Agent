import type { OcclusionMetrics, Severity } from './types'

/**
 * 가려짐(occlusion) 분석의 순수 로직. DOM 없이 스타일 문자열과 조상 체인만으로 동작해 단위 테스트가 가능하다.
 * 브라우저 쪽 수집(elementFromPoint, 표본점, 체인 구성)은 detector.ts 가 맡는다.
 */

/** getComputedStyle 에서 stacking context 판정에 필요한 값만 뽑은 것 */
export interface StackStyle {
  position: string
  zIndex: string
  opacity: string
  transform: string
  rotate: string
  scale: string
  translate: string
  filter: string
  backdropFilter: string
  perspective: string
  clipPath: string
  isolation: string
  mixBlendMode: string
  willChange: string
  contain: string
  /** 부모의 display. flex/grid item 은 static 이어도 z-index 가 적용된다 */
  parentDisplay: string
}

const isNone = (value: string): boolean => value === '' || value === 'none'
const STACKING_WILL_CHANGE = /opacity|transform|filter|perspective|clip-path|isolation|mix-blend-mode|backdrop-filter|translate|rotate|scale/
const STACKING_CONTAIN = /layout|paint|strict|content/

/** 이 요소가 stacking context 를 만들면 그 이유를, 아니면 undefined 를 반환한다 */
export const stackingReason = (style: StackStyle): string | undefined => {
  if (style.position === 'fixed' || style.position === 'sticky') return `position: ${style.position}`
  const zIndexApplies = style.position !== 'static' || /flex|grid/.test(style.parentDisplay)
  if (style.zIndex !== 'auto' && zIndexApplies) return `z-index: ${style.zIndex}`
  if (style.opacity !== '' && Number(style.opacity) < 1) return `opacity: ${style.opacity}`
  const transformProperty = (
    [['transform', style.transform], ['rotate', style.rotate], ['scale', style.scale], ['translate', style.translate]] as const
  ).find(([, value]): boolean => !isNone(value))
  if (transformProperty) return transformProperty[0]
  if (!isNone(style.filter)) return 'filter'
  if (!isNone(style.backdropFilter)) return 'backdrop-filter'
  if (!isNone(style.perspective)) return 'perspective'
  if (!isNone(style.clipPath)) return 'clip-path'
  if (style.isolation === 'isolate') return 'isolation: isolate'
  if (style.mixBlendMode !== '' && style.mixBlendMode !== 'normal') return `mix-blend-mode: ${style.mixBlendMode}`
  if (STACKING_WILL_CHANGE.test(style.willChange)) return `will-change: ${style.willChange}`
  if (STACKING_CONTAIN.test(style.contain)) return `contain: ${style.contain}`
  return undefined
}

/** z-index 가 실제로 적용되는 요소의 값. static(비-flex/grid item)이거나 auto 이면 undefined */
export const effectiveZIndex = (style: StackStyle): number | undefined => {
  const applies = style.position !== 'static' || /flex|grid/.test(style.parentDisplay)
  const value = Number(style.zIndex)
  return applies && style.zIndex !== 'auto' && Number.isFinite(value) ? value : undefined
}

/** 조상 체인(루트 → 요소)의 한 칸 */
export interface ChainLayer {
  /** 요소 식별자. 두 체인의 공통 조상을 찾는 데 쓴다 */
  id: string
  selector: string
  /** auto 이면 undefined */
  zIndex?: number
  /** stacking context 를 만드는 이유. 만들지 않으면 undefined */
  reason?: string
  /** 문서 순서(앞일수록 작다). z-index 가 같을 때 나중에 오는 쪽이 위에 그려진다 */
  order: number
}

export interface StackingComparison {
  nodeRep: ChainLayer
  occluderRep: ChainLayer
  /** node 가 조상 컨텍스트 안에 있어 자기 z-index 가 겨루는 대상이 아닌 경우 */
  trapped: boolean
  /** 규칙상 node 쪽이 위에 그려져야 하는지. true 인데 가려졌다면 이 규칙으로는 원인을 알 수 없다 */
  nodeAbove: boolean
}

/**
 * 두 요소의 조상 체인으로 "가장 가까운 공통 컨텍스트 안에서 누가 위인가"를 계산한다.
 * 각 요소는 공통 조상 아래에서 처음 만나는 stacking context(없으면 자기 자신)가 대표로 겨룬다.
 * shortcut: z-index:auto 인 positioned 요소와 비-positioned 요소를 같은 z=0 층으로 본다(문서 순서로만 비교), 정밀한 페인트 순서가 필요하면 업그레이드
 */
export const compareStacking = (nodeChain: ChainLayer[], occluderChain: ChainLayer[]): StackingComparison => {
  let common = 0
  while (common < nodeChain.length && common < occluderChain.length && nodeChain[common]?.id === occluderChain[common]?.id) common++
  const pick = (chain: ChainLayer[]): ChainLayer => {
    const below = chain.slice(common)
    const own = below.find((layer): boolean => layer.reason !== undefined)
    return own ?? below[below.length - 1] ?? (chain[chain.length - 1] as ChainLayer)
  }
  const nodeRep = pick(nodeChain)
  const occluderRep = pick(occluderChain)
  const nodeZ = nodeRep.zIndex ?? 0
  const occluderZ = occluderRep.zIndex ?? 0
  return {
    nodeRep,
    occluderRep,
    trapped: nodeRep.id !== nodeChain[nodeChain.length - 1]?.id,
    nodeAbove: nodeZ > occluderZ || (nodeZ === occluderZ && nodeRep.order > occluderRep.order)
  }
}

/** 가려진 비율이 크거나 포커스 가능한 요소가 가려졌으면 high */
export const classifyOcclusionSeverity = (coveredRatio: number, hasInteractive: boolean): Severity => {
  if (hasInteractive || coveredRatio >= 0.8) return 'high'
  if (coveredRatio >= 0.5) return 'medium'
  return 'low'
}

export type OcclusionCause = OcclusionMetrics['cause']
