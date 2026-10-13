import { describe, expect, it } from 'vitest'
import { defectMagnitude, describeDefect, diagnoseFocus, formatMagnitude, toAgentPayload } from '../src'
import type { Defect, FocusMetrics, NodeSnapshot } from '../src'

const snapshot = (overrides: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  selector: 'section.share-sheet',
  tag: 'section',
  classes: ['share-sheet'],
  rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: [],
  ...overrides
})

const metrics = (overrides: Partial<FocusMetrics> = {}): FocusMetrics => ({
  kind: 'focus-escape',
  trigger: 'aria-modal',
  focusableCount: 2,
  escapesForward: true,
  escapesBackward: true,
  tabsToEscape: 2,
  ...overrides
})

const defectOf = (focus: FocusMetrics): Defect => ({
  id: 'd_3',
  fingerprint: 'f',
  kind: 'focus-escape',
  severity: 'high',
  url: 'http://localhost/',
  viewport: { width: 375, height: 812 },
  node: snapshot(),
  parent: snapshot({ selector: 'main', tag: 'main', classes: [] }),
  metrics: focus,
  suggestions: diagnoseFocus(focus),
  detectedAt: ''
})

describe('diagnoseFocus', () => {
  it('CSS 선언 없이 포커스 트랩 안내만 제안한다', () => {
    const [suggestion, ...rest] = diagnoseFocus(metrics())
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'focus-trap-missing', target: 'node', declarations: {} })
    expect(suggestion?.reason).toContain('aria-modal')
  })

  it('도착 지점이 body 이면 문서/브라우저 UI 로 나갔다고 설명한다', () => {
    const reason = diagnoseFocus(metrics({ escapedTo: snapshot({ tag: 'body', selector: 'body' }) }))[0]?.reason
    expect(reason).toContain('문서/브라우저 UI')
  })

  it('도착 지점이 요소이면 그 셀렉터를 알려 준다', () => {
    const reason = diagnoseFocus(metrics({ escapedTo: snapshot({ tag: 'button', selector: 'button.menu' }) }))[0]?.reason
    expect(reason).toContain('button.menu')
  })
})

describe('defectMagnitude / formatMagnitude (focus-escape)', () => {
  it('이탈하는 방향 수(0~2)를 크기로 쓴다', () => {
    expect(defectMagnitude(defectOf(metrics()))).toBe(2)
    expect(defectMagnitude(defectOf(metrics({ escapesBackward: false })))).toBe(1)
    expect(defectMagnitude(defectOf(metrics({ escapesForward: false, escapesBackward: false })))).toBe(0)
  })

  it('목록 표기에 이탈 방향을 담는다', () => {
    expect(formatMagnitude(defectOf(metrics()))).toBe('포커스 이탈 (Tab 2번째, Shift+Tab)')
    expect(formatMagnitude(defectOf(metrics({ escapesForward: false })))).toBe('포커스 이탈 (Shift+Tab)')
  })
})

describe('toAgentPayload (focus-escape)', () => {
  it('요약과 focus 페이로드에 이탈 방향과 모달 판정 근거를 담는다', () => {
    const payload = toAgentPayload(defectOf(metrics({ escapedTo: snapshot({ tag: 'button', selector: 'button.menu', classes: ['menu'] }) })))
    expect(payload.kind).toBe('focus-escape/aria-modal')
    expect(payload.summary).toContain('.share-sheet')
    expect(payload.summary).toContain('Tab 2번째')
    expect(payload.focus).toMatchObject({ trigger: 'aria-modal', focusableCount: 2, escapesForward: true, escapesBackward: true, tabsToEscape: 2 })
    expect(payload.focus?.escapedTo?.tag).toBe('button')
    expect(describeDefect(defectOf(metrics()))).toContain('포커스 가능 요소 2개')
  })
})
