import { describe, expect, it } from 'vitest'
import type { Defect, NodeSnapshot, ScanResult, Severity } from '@inspector-agent/core'
import { defectsAtOrAbove, parseFailOn, renderMarkdown } from '../src/report'

const snapshot = (selector: string, file?: string): NodeSnapshot => ({
  selector,
  tag: 'div',
  classes: [],
  source: file ? { file, line: 4, column: 5, exact: true } : undefined,
  rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: []
})

const defect = (severity: Severity, file?: string, selector = 'div.a | b'): Defect => ({
  id: 'd_1',
  fingerprint: 'f',
  kind: 'overflow-x',
  severity,
  url: 'http://localhost:5173/',
  viewport: { width: 375, height: 812 },
  node: snapshot(selector, file),
  parent: snapshot('main'),
  metrics: { kind: 'overflow-x', mode: 'box', overflowPx: 120.4, overflowRatio: 0.4, parentContentWidth: 300, nodeWidth: 420 },
  suggestions: [{ hint: 'fixed-width', target: 'node', declarations: {}, reason: '' }],
  detectedAt: ''
})

const scan = (...defects: Defect[]): ScanResult => ({
  url: 'http://localhost:5173/',
  viewport: { width: 375, height: 812 },
  documentOverflowPx: 0,
  defects,
  stats: { scannedNodes: 10, durationMs: 1 }
})

describe('parseFailOn', () => {
  it('플래그가 없으면 undefined, 유효한 값은 그대로 돌려준다', () => {
    expect(parseFailOn(undefined)).toBeUndefined()
    expect(parseFailOn('medium')).toBe('medium')
  })

  it('잘못된 값은 거부한다', () => {
    expect(() => parseFailOn('critical')).toThrow('high, medium, low')
    expect(() => parseFailOn('')).toThrow('받은 값: 없음')
  })
})

describe('defectsAtOrAbove', () => {
  const results = [scan(defect('low'), defect('medium')), scan(defect('high'))]

  it('기준 이상만 센다 (high 는 high 만, medium 은 medium 이상, low 는 전부)', () => {
    expect(defectsAtOrAbove(results, 'high')).toHaveLength(1)
    expect(defectsAtOrAbove(results, 'medium')).toHaveLength(2)
    expect(defectsAtOrAbove(results, 'low')).toHaveLength(3)
  })

  it('결함이 없으면 어떤 기준에서도 0건이다', () => {
    expect(defectsAtOrAbove([scan()], 'low')).toEqual([])
  })
})

describe('renderMarkdown', () => {
  it('결함이 없으면 통과 한 줄만 남긴다', () => {
    const text = renderMarkdown('http://localhost:5173/', [scan()], 'high')
    expect(text).toContain('✅ 통과')
    expect(text).not.toContain('| 뷰포트 |')
  })

  it('기준 초과 건수를 헤더에 쓰고 결함을 표로 남기며, 셀 안의 | 는 이스케이프한다', () => {
    const text = renderMarkdown('http://localhost:5173/', [scan(defect('high', 'src/A.vue'), defect('low'))], 'high')
    expect(text).toContain('❌ 실패: `high` 이상 1건')
    expect(text).toContain('| 375px | 🔴 high | `src/A.vue:4` | overflow-x | box +120px | fixed-width |')
    expect(text).toContain('`div.a \\| b`')
  })

  it('기준이 없으면 통과/실패를 판정하지 않는다', () => {
    expect(renderMarkdown('http://localhost:5173/', [scan(defect('low'))], undefined)).toContain('통과/실패 기준 없음')
  })
})
