import { describe, expect, it } from 'vitest'
import type { ModalProbe, NodeSnapshot } from '@inspector-agent/core'
import { buildFocusDefect } from '../src/focus'

const snapshot = (overrides: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  selector: 'section.share-sheet',
  tag: 'section',
  classes: ['share-sheet'],
  source: { file: 'src/components/ShareSheet.vue', line: 2, column: 3, exact: true },
  rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 2,
  childClasses: [],
  ...overrides
})

const modal: ModalProbe = {
  index: 0,
  trigger: 'aria-modal',
  focusableCount: 2,
  node: snapshot(),
  parent: snapshot({ selector: 'main', tag: 'main', classes: [], source: undefined })
}

const context = { url: 'http://localhost:5173/', viewport: { width: 375, height: 812 }, detectedAt: '2026-10-13T00:00:00.000Z' }

describe('buildFocusDefect', () => {
  it('앞/뒤 이탈 결과를 메트릭으로 옮기고 소스 위치 기반 fingerprint 를 만든다', () => {
    const body = snapshot({ tag: 'body', selector: 'body', source: undefined })
    const defect = buildFocusDefect(modal, { forward: { presses: 2, escapedTo: body }, backward: { escapedTo: body } }, context)
    expect(defect).toMatchObject({
      kind: 'focus-escape',
      severity: 'high',
      fingerprint: 'focus-escape|src/components/ShareSheet.vue:2:3|375',
      metrics: { escapesForward: true, escapesBackward: true, tabsToEscape: 2, focusableCount: 2, trigger: 'aria-modal' }
    })
    expect(defect.suggestions[0]?.hint).toBe('focus-trap-missing')
  })

  it('한쪽 방향만 나가면 나머지는 false 로 둔다', () => {
    const defect = buildFocusDefect(modal, { backward: {} }, context)
    expect(defect.metrics).toMatchObject({ escapesForward: false, escapesBackward: true })
    expect(defect.metrics.kind === 'focus-escape' && defect.metrics.tabsToEscape).toBeUndefined()
  })

  it('같은 URL·소스·뷰포트면 id 가 같고 뷰포트가 다르면 달라진다', () => {
    const a = buildFocusDefect(modal, { backward: {} }, context)
    const b = buildFocusDefect(modal, { backward: {} }, context)
    const c = buildFocusDefect(modal, { backward: {} }, { ...context, viewport: { width: 768, height: 1024 } })
    expect(a.id).toBe(b.id)
    expect(a.id).not.toBe(c.id)
  })
})
