import { describe, expect, it } from 'vitest'
import { applyEdits, createFingerprint, diagnose, parseSourceAttribute, toAgentPayload } from '../src'
import type { Defect, NodeSnapshot, OverflowMetrics } from '../src'

const snapshot = (overrides: Partial<NodeSnapshot>): NodeSnapshot => ({
  selector: 'div',
  tag: 'div',
  classes: [],
  rect: { x: 0, y: 0, width: 100, height: 20, right: 100, bottom: 20 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: [],
  ...overrides
})

const boxMetrics: OverflowMetrics = { mode: 'box', overflowPx: 60, overflowRatio: 0.19, parentContentWidth: 320, nodeWidth: 380 }

describe('diagnose', () => {
  it('flex item의 min-width:auto 를 첫 번째 원인으로 진단한다', () => {
    const node = snapshot({ styles: { 'min-width': 'auto' } })
    const parent = snapshot({ styles: { display: 'flex' }, childElementCount: 2 })
    const hints = diagnose(node, parent, boxMetrics).map((s) => s.hint)
    expect(hints).toEqual(['flex-item-min-width', 'flex-nowrap'])
  })

  it('nowrap 텍스트에는 말줄임 처리를 제안한다', () => {
    const node = snapshot({ styles: { 'white-space': 'nowrap' } })
    const result = diagnose(node, snapshot({}), { ...boxMetrics, mode: 'content' })
    expect(result[0]?.hint).toBe('nowrap-text')
    expect(result[0]?.declarations['text-overflow']).toBe('ellipsis')
  })

  it('공백 없는 긴 문자열에는 overflow-wrap 을 제안한다', () => {
    const result = diagnose(snapshot({}), snapshot({}), { ...boxMetrics, mode: 'content' })
    expect(result.map((s) => s.hint)).toEqual(['unbreakable-text'])
  })

  it('미디어 요소에는 max-width:100% 를 제안한다', () => {
    const result = diagnose(snapshot({ tag: 'img' }), snapshot({}), boxMetrics)
    expect(result.map((s) => s.hint)).toEqual(['media-max-width'])
  })
})

describe('applyEdits', () => {
  it('유일한 oldText 를 치환한다', () => {
    const result = applyEdits('.a { color: red; }', [{ oldText: 'color: red;', newText: 'color: blue;' }])
    expect(result).toEqual({ ok: true, content: '.a { color: blue; }' })
  })

  it('여러 번 등장하는 oldText 는 거부한다', () => {
    const result = applyEdits('a a', [{ oldText: 'a', newText: 'b' }])
    expect(result.ok).toBe(false)
  })

  it('없는 oldText 는 거부한다', () => {
    expect(applyEdits('abc', [{ oldText: 'z', newText: 'y' }]).ok).toBe(false)
  })

  it('치환 문자열의 $ 패턴을 그대로 둔다', () => {
    const result = applyEdits('x', [{ oldText: 'x', newText: '$&$1' }])
    expect(result).toEqual({ ok: true, content: '$&$1' })
  })
})

describe('fingerprint', () => {
  it('정확한 소스 위치가 있으면 셀렉터 대신 소스를 키로 쓴다', () => {
    const source = parseSourceAttribute('src/components/Card.vue:12:5', true)
    expect(createFingerprint('overflow-x', source, 'div.card', 375)).toBe('overflow-x|src/components/Card.vue:12:5|375')
  })

  it('잘못된 속성 값은 undefined 를 반환한다', () => {
    expect(parseSourceAttribute('oops', true)).toBeUndefined()
  })
})

describe('toAgentPayload', () => {
  it('부모와 같은 상속 속성은 자식 페이로드에서 제거한다', () => {
    const defect: Defect = {
      id: 'd_1',
      fingerprint: 'f',
      kind: 'overflow-x',
      severity: 'high',
      url: 'http://localhost/',
      viewport: { width: 375, height: 812 },
      node: snapshot({ styles: { 'white-space': 'nowrap', 'min-width': 'auto' } }),
      parent: snapshot({ styles: { 'white-space': 'nowrap', display: 'flex' } }),
      metrics: boxMetrics,
      suggestions: [],
      detectedAt: ''
    }
    const payload = toAgentPayload(defect)
    expect(payload.node.styles).toEqual({ 'min-width': 'auto' })
    expect(payload.summary).toContain('60px')
  })
})
