import { describe, expect, it } from 'vitest'
import {
  classifyClippedSeverity,
  classifyVerticalSeverity,
  defectMagnitude,
  describeDefect,
  diagnoseClippedText,
  diagnoseVertical,
  formatMagnitude,
  isTextClipStyle,
  isVerticalCandidate,
  toAgentPayload
} from '../src'
import type { ClipStyle, ClippedTextMetrics, Defect, NodeSnapshot, VerticalCandidateStyle, VerticalOverflowMetrics } from '../src'

const snapshot = (overrides: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  selector: 'section.fixed-card',
  tag: 'section',
  classes: ['fixed-card'],
  rect: { x: 0, y: 0, width: 311, height: 64, right: 311, bottom: 64 },
  scrollWidth: 311,
  clientWidth: 311,
  styles: {},
  childElementCount: 2,
  childClasses: [],
  ...overrides
})

describe('isVerticalCandidate (세로 오버플로우 1차 판정)', () => {
  const base: VerticalCandidateStyle = { display: 'block', overflowY: 'visible', clientHeight: 64, scrollHeight: 120 }

  it('overflow-y: visible 이고 콘텐츠가 컨테이너보다 4px 이상 크면 후보다', () => {
    expect(isVerticalCandidate(base)).toBe(true)
  })

  it.each([
    ['스크롤 컨테이너(의도된 스크롤)', { overflowY: 'auto' }],
    ['잘림 컨테이너', { overflowY: 'hidden' }],
    ['clip', { overflowY: 'clip' }],
    ['서브픽셀 차이(3px)', { scrollHeight: 67 }],
    ['넘치지 않음', { scrollHeight: 64 }],
    ['display: none', { display: 'none' }],
    ['인라인(높이가 없다)', { display: 'inline' }],
    ['높이 0', { clientHeight: 0 }]
  ])('%s 는 후보가 아니다', (_name, overrides) => {
    expect(isVerticalCandidate({ ...base, ...overrides })).toBe(false)
  })
})

describe('isTextClipStyle (텍스트 잘림 1차 판정)', () => {
  const base: ClipStyle = {
    tag: 'p',
    overflowX: 'hidden',
    textOverflow: 'clip',
    clipPath: 'none',
    clip: 'auto',
    lineClamp: 'none',
    maskImage: 'none',
    animationName: 'none',
    clientWidth: 140,
    clientHeight: 24
  }

  it('overflow: hidden 이고 말줄임이 없으면 후보다 (clip 도 마찬가지)', () => {
    expect(isTextClipStyle(base)).toBe(true)
    expect(isTextClipStyle({ ...base, overflowX: 'clip' })).toBe(true)
  })

  it.each([
    ['말줄임이 있는 의도된 잘림', { textOverflow: 'ellipsis' }],
    ['input (값을 스크롤해서 본다)', { tag: 'input' }],
    ['textarea', { tag: 'textarea' }],
    ['select', { tag: 'select' }],
    ['overflow: visible', { overflowX: 'visible' }],
    ['overflow: auto (스크롤)', { overflowX: 'auto' }],
    ['sr-only 같은 1px 박스', { clientWidth: 1, clientHeight: 1 }],
    ['clip: rect(...) 로 숨긴 문구', { clip: 'rect(0px, 0px, 0px, 0px)' }],
    ['clip-path 로 숨김', { clipPath: 'inset(50%)' }],
    ['line-clamp', { lineClamp: '2' }],
    ['마스크 페이드', { maskImage: 'linear-gradient(black, transparent)' }],
    ['마퀴 애니메이션', { animationName: 'marquee' }]
  ])('%s 는 후보가 아니다', (_name, overrides) => {
    expect(isTextClipStyle({ ...base, ...overrides })).toBe(false)
  })
})

describe('심각도', () => {
  it('세로 넘침은 24px 이상 high, 8px 이상 medium', () => {
    expect(classifyVerticalSeverity(24)).toBe('high')
    expect(classifyVerticalSeverity(8)).toBe('medium')
    expect(classifyVerticalSeverity(7.9)).toBe('low')
  })

  it('텍스트 잘림은 30% 이상 high, 10% 이상 medium', () => {
    expect(classifyClippedSeverity(0.6)).toBe('high')
    expect(classifyClippedSeverity(0.3)).toBe('high')
    expect(classifyClippedSeverity(0.1)).toBe('medium')
    expect(classifyClippedSeverity(0.05)).toBe('low')
  })
})

const vertical: VerticalOverflowMetrics = { kind: 'overflow-y', overflowPx: 56.2, containerHeight: 64, contentHeight: 120, culprit: { selector: 'p.fixed-card__text' } }
const clipped: ClippedTextMetrics = {
  kind: 'clipped-text',
  clippedPx: 217,
  hiddenRatio: 0.6,
  visibleWidth: 140,
  fullWidth: 360,
  text: 'Ultralight-Backpacking-Titanium-Cookset',
  whiteSpace: 'nowrap'
}

describe('diagnoseVertical', () => {
  it('높이를 늘어나게 하는 제안이 먼저이고, 현재 높이를 min-height 로 남긴다', () => {
    const [first, second, ...rest] = diagnoseVertical(snapshot(), vertical)
    expect(rest).toEqual([])
    expect(first).toMatchObject({ hint: 'fixed-height', target: 'node', declarations: { height: 'auto', 'min-height': '64px' } })
    expect(first?.reason).toContain('p.fixed-card__text')
    expect(second).toMatchObject({ hint: 'vertical-scroll', declarations: { 'overflow-y': 'auto' } })
  })

  it('원인 자식이 없으면(텍스트가 직접 넘침) 콘텐츠라고만 설명한다', () => {
    expect(diagnoseVertical(snapshot(), { ...vertical, culprit: undefined })[0]?.reason).toContain('콘텐츠가')
  })
})

describe('diagnoseClippedText', () => {
  it('한 줄 라벨이 아니면 말줄임과 함께 white-space: nowrap 도 제안한다', () => {
    const [ellipsis] = diagnoseClippedText(snapshot(), { ...clipped, whiteSpace: 'normal' })
    expect(ellipsis?.declarations).toEqual({ 'text-overflow': 'ellipsis', 'white-space': 'nowrap' })
  })

  it('이미 nowrap 이면 text-overflow 만 제안하고, 줄바꿈으로 다 보여 주는 대안을 둔다', () => {
    const [ellipsis, wrap] = diagnoseClippedText(snapshot(), clipped)
    expect(ellipsis).toMatchObject({ hint: 'text-ellipsis', declarations: { 'text-overflow': 'ellipsis' } })
    expect(ellipsis?.reason).toContain('60%')
    expect(wrap).toMatchObject({ hint: 'text-wrap', declarations: { 'white-space': 'normal', 'overflow-wrap': 'anywhere' } })
  })
})

const defectOf = (metrics: VerticalOverflowMetrics | ClippedTextMetrics): Defect =>
  ({
    id: 'd_9',
    fingerprint: 'f',
    kind: metrics.kind,
    severity: 'high',
    url: 'http://localhost/',
    viewport: { width: 375, height: 812 },
    node: snapshot(),
    parent: snapshot({ selector: 'main', tag: 'main', classes: [] }),
    metrics,
    suggestions: [],
    detectedAt: ''
  }) as Defect

describe('새 결함 종류의 요약과 페이로드', () => {
  it('크기 지표는 px 이고 목록 표기는 종류를 구분한다', () => {
    expect(defectMagnitude(defectOf(vertical))).toBe(56.2)
    expect(defectMagnitude(defectOf(clipped))).toBe(217)
    expect(formatMagnitude(defectOf(vertical))).toBe('세로 넘침 +56px')
    expect(formatMagnitude(defectOf(clipped))).toBe('텍스트 잘림 60% (217px)')
  })

  it('요약 문장에 원인 요소와 수치를 담는다', () => {
    expect(describeDefect(defectOf(vertical))).toContain('높이 64px 가 콘텐츠 120px 보다 작아 56px 세로로 넘침')
    expect(describeDefect(defectOf(clipped))).toContain('말줄임(text-overflow: ellipsis)이 없음')
    expect(toAgentPayload(defectOf(vertical)).kind).toBe('overflow-y')
    expect(toAgentPayload(defectOf(clipped)).kind).toBe('clipped-text')
  })
})
