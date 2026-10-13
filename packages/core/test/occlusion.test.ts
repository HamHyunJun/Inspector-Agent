import { describe, expect, it } from 'vitest'
import { classifyOcclusionSeverity, compareStacking, diagnoseOcclusion, effectiveZIndex, stackingReason, toAgentPayload } from '../src'
import type { ChainLayer, Defect, NodeSnapshot, OcclusionMetrics, StackStyle } from '../src'

const style = (overrides: Partial<StackStyle> = {}): StackStyle => ({
  position: 'static',
  zIndex: 'auto',
  opacity: '1',
  transform: 'none',
  rotate: 'none',
  scale: 'none',
  translate: 'none',
  filter: 'none',
  backdropFilter: 'none',
  perspective: 'none',
  clipPath: 'none',
  isolation: 'auto',
  mixBlendMode: 'normal',
  willChange: 'auto',
  contain: 'none',
  parentDisplay: 'block',
  ...overrides
})

const layer = (id: number, overrides: Partial<ChainLayer> = {}): ChainLayer => ({
  id: String(id),
  selector: `el${id}`,
  order: id,
  ...overrides
})

describe('stackingReason', () => {
  it('아무 속성도 없으면 stacking context 를 만들지 않는다', () => {
    expect(stackingReason(style())).toBeUndefined()
  })

  it.each([
    [{ position: 'fixed' }, 'position: fixed'],
    [{ position: 'relative', zIndex: '3' }, 'z-index: 3'],
    [{ opacity: '0.9' }, 'opacity: 0.9'],
    [{ transform: 'matrix(1, 0, 0, 1, 0, 10)' }, 'transform'],
    [{ translate: '10px 0px' }, 'translate'],
    [{ filter: 'blur(2px)' }, 'filter'],
    [{ isolation: 'isolate' }, 'isolation: isolate'],
    [{ willChange: 'transform' }, 'will-change: transform'],
    [{ contain: 'paint' }, 'contain: paint']
  ] as Array<[Partial<StackStyle>, string]>)('%o → %s', (overrides, reason) => {
    expect(stackingReason(style(overrides))).toBe(reason)
  })

  it('static 요소의 z-index 는 무시하지만 flex item 이면 적용한다', () => {
    expect(stackingReason(style({ zIndex: '5' }))).toBeUndefined()
    expect(stackingReason(style({ zIndex: '5', parentDisplay: 'flex' }))).toBe('z-index: 5')
  })
})

describe('effectiveZIndex', () => {
  it('적용되지 않거나 auto 이면 undefined', () => {
    expect(effectiveZIndex(style({ zIndex: '5' }))).toBeUndefined()
    expect(effectiveZIndex(style({ position: 'absolute' }))).toBeUndefined()
    expect(effectiveZIndex(style({ position: 'absolute', zIndex: '7' }))).toBe(7)
    expect(effectiveZIndex(style({ position: 'absolute', zIndex: '-1' }))).toBe(-1)
  })
})

describe('compareStacking', () => {
  const html = layer(0)
  const body = layer(1)

  it('같은 컨텍스트에서 z-index 가 낮으면 z-index 부족으로 본다', () => {
    const node = layer(5, { zIndex: 10, reason: 'z-index: 10' })
    const occluder = layer(2, { zIndex: 20, reason: 'z-index: 20' })
    const result = compareStacking([html, body, node], [html, body, occluder])
    expect(result).toMatchObject({ trapped: false, nodeAbove: false })
    expect(result.occluderRep.id).toBe('2')
  })

  it('조상 stacking context 에 갇히면 자기 z-index 가 아무리 커도 조상끼리 겨룬다', () => {
    const card = layer(3, { reason: 'transform' }) // z-index auto → 0 층
    const dropdown = layer(4, { zIndex: 9999, reason: 'z-index: 9999' })
    const sticky = layer(6, { zIndex: 20, reason: 'position: sticky' })
    const result = compareStacking([html, body, card, dropdown], [html, body, sticky])
    expect(result.trapped).toBe(true)
    expect(result.nodeRep.id).toBe('3')
    expect(result.nodeAbove).toBe(false)
  })

  it('z-index 가 같으면 문서 순서상 나중인 쪽이 위다', () => {
    const early = layer(2, { zIndex: 5, reason: 'z-index: 5' })
    const late = layer(7, { zIndex: 5, reason: 'z-index: 5' })
    expect(compareStacking([html, body, early], [html, body, late]).nodeAbove).toBe(false)
    expect(compareStacking([html, body, late], [html, body, early]).nodeAbove).toBe(true)
  })

  it('규칙상 node 가 위인데 가려졌다면 nodeAbove 가 true 로 남아 원인을 단정하지 않게 한다', () => {
    const node = layer(5, { zIndex: 50, reason: 'z-index: 50' })
    const occluder = layer(2, { zIndex: 1, reason: 'z-index: 1' })
    expect(compareStacking([html, body, node], [html, body, occluder]).nodeAbove).toBe(true)
  })
})

describe('classifyOcclusionSeverity', () => {
  it('포커스 가능한 요소가 가려지거나 80% 이상이면 high', () => {
    expect(classifyOcclusionSeverity(0.6, true)).toBe('high')
    expect(classifyOcclusionSeverity(0.8, false)).toBe('high')
    expect(classifyOcclusionSeverity(0.6, false)).toBe('medium')
    expect(classifyOcclusionSeverity(0.4, false)).toBe('low')
  })
})

const snapshot = (overrides: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  selector: 'ul.menu',
  tag: 'ul',
  classes: ['menu'],
  rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: [],
  ...overrides
})

const occlusionMetrics = (overrides: Partial<OcclusionMetrics> = {}): OcclusionMetrics => ({
  kind: 'occluded',
  coveredRatio: 1,
  sampledPoints: 5,
  occluder: snapshot({ selector: 'header.bar', tag: 'header', classes: ['bar'] }),
  nodeLayer: { selector: 'article.card', reason: 'transform' },
  occluderLayer: { selector: 'header.bar', zIndex: 20, reason: 'position: sticky' },
  cause: 'unknown',
  ...overrides
})

describe('diagnoseOcclusion', () => {
  it('조상에 갇힌 경우 z-index 올리기가 아니라 컨텍스트 해제를 제안하고 선언은 비운다', () => {
    const [suggestion, ...rest] = diagnoseOcclusion(snapshot(), occlusionMetrics({ cause: 'stacking-context' }))
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'stacking-context-trap', target: 'ancestor', declarations: {} })
    expect(suggestion?.reason).toContain('transform')
  })

  it('z-index 부족이면 가린 쪽보다 1 큰 값을 제안하고 static 이면 position 도 함께 제안한다', () => {
    const metrics = occlusionMetrics({ cause: 'z-index' })
    expect(diagnoseOcclusion(snapshot({ styles: { position: 'absolute' } }), metrics)[0]?.declarations).toEqual({ 'z-index': '21' })
    expect(diagnoseOcclusion(snapshot(), metrics)[0]?.declarations).toEqual({ position: 'relative', 'z-index': '21' })
  })

  it('overflow 에 잘리면 조상의 overflow: visible 을 제안한다', () => {
    const metrics = occlusionMetrics({ cause: 'overflow-clip', clippedBy: { selector: 'div.wrap', overflow: 'hidden' } })
    expect(diagnoseOcclusion(snapshot(), metrics)[0]).toMatchObject({ hint: 'overflow-clipped-popup', target: 'ancestor', declarations: { overflow: 'visible' } })
  })

  it('원인을 모르면 제안하지 않는다', () => {
    expect(diagnoseOcclusion(snapshot(), occlusionMetrics())).toEqual([])
  })
})

describe('toAgentPayload (occluded)', () => {
  it('요약과 occlusion 페이로드에 가린 요소와 stacking 정보를 담는다', () => {
    const defect: Defect = {
      id: 'd_2',
      fingerprint: 'f',
      kind: 'occluded',
      severity: 'high',
      url: 'http://localhost/',
      viewport: { width: 375, height: 812 },
      node: snapshot(),
      parent: snapshot({ selector: 'article.card', tag: 'article', classes: ['card'] }),
      metrics: occlusionMetrics({ cause: 'stacking-context' }),
      suggestions: [],
      detectedAt: ''
    }
    const payload = toAgentPayload(defect)
    expect(payload.kind).toBe('occluded/stacking-context')
    expect(payload.summary).toContain('100%')
    expect(payload.summary).toContain('header.bar')
    expect(payload.occlusion?.nodeLayer).toContain('transform')
  })
})
