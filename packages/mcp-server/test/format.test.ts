import { describe, expect, it } from 'vitest'
import type { NodeSnapshot } from '@inspector-agent/core'
import type { DefectSummary, PatchResponse } from '../src/dashboard-client'
import { formatDefectList, formatPatch } from '../src/format'

const snapshot = (selector: string): NodeSnapshot => ({
  selector,
  tag: 'ul',
  classes: [],
  source: { file: 'src/components/Menu.vue', line: 6, column: 7, exact: true },
  rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: []
})

const base = {
  id: 'd_1',
  fingerprint: 'f',
  severity: 'high' as const,
  url: 'http://localhost/',
  viewport: { width: 375, height: 812 },
  node: snapshot('ul.menu'),
  parent: snapshot('article.card'),
  detectedAt: '',
  status: 'open'
}

const occluded: DefectSummary = {
  ...base,
  kind: 'occluded',
  metrics: {
    kind: 'occluded',
    coveredRatio: 1,
    sampledPoints: 5,
    occluder: snapshot('aside.bar'),
    nodeLayer: { selector: 'article.card', reason: 'transform' },
    occluderLayer: { selector: 'aside.bar', zIndex: 20, reason: 'z-index: 20' },
    cause: 'stacking-context'
  },
  suggestions: [{ hint: 'stacking-context-trap', target: 'ancestor', declarations: {}, reason: '' }]
}

const overflow: DefectSummary = {
  ...base,
  id: 'd_2',
  kind: 'overflow-x',
  metrics: { kind: 'overflow-x', mode: 'box', overflowPx: 232.4, overflowRatio: 0.7, parentContentWidth: 311, nodeWidth: 543 },
  suggestions: []
}

const focusEscape: DefectSummary = {
  ...base,
  id: 'd_3',
  kind: 'focus-escape',
  metrics: { kind: 'focus-escape', trigger: 'aria-modal', focusableCount: 2, escapesForward: true, escapesBackward: false, tabsToEscape: 2 },
  suggestions: [{ hint: 'focus-trap-missing', target: 'node', declarations: {}, reason: '' }]
}

describe('formatDefectList', () => {
  it('오버플로우는 px, 가려짐은 비율과 원인으로 한 줄씩 요약한다', () => {
    const lines = formatDefectList([overflow, occluded]).split('\n')
    expect(lines[0]).toContain('box +232px')
    expect(lines[1]).toContain('가려짐 100% (stacking-context)')
    expect(lines[1]).toContain('hints=stacking-context-trap')
  })

  it('포커스 이탈은 방향과 hint 로 요약한다', () => {
    expect(formatDefectList([focusEscape])).toContain('포커스 이탈 (Tab 2번째) hints=focus-trap-missing')
  })
})

describe('formatPatch', () => {
  const patch = (verification: PatchResponse['verification']): PatchResponse => ({
    id: 'p_1',
    defectId: 'd_1',
    file: 'src/components/Menu.vue',
    status: 'failed',
    diff: '',
    rationale: '',
    verification
  })

  it('재측정 수치를 unit 에 맞게 표기한다', () => {
    expect(formatPatch(patch({ passed: false, verdict: 'v', unit: 'ratio', beforePx: 1, afterPx: 0.4, regressions: [] }), 'http://localhost:3000')).toContain('100% → 40%')
    expect(formatPatch(patch({ passed: false, verdict: 'v', unit: 'count', beforePx: 2, afterPx: 1, regressions: [] }), 'http://localhost:3000')).toContain('2방향 → 1방향')
    expect(formatPatch(patch({ passed: true, verdict: 'v', beforePx: 230, afterPx: 0, regressions: [] }), 'http://localhost:3000')).toContain('230px → 0px')
  })

  it('회귀 결함도 종류에 맞게 표기한다', () => {
    const text = formatPatch(patch({ passed: false, verdict: 'v', unit: 'px', beforePx: 10, afterPx: 0, regressions: [occluded] }), 'http://localhost:3000')
    expect(text).toContain('회귀: src/components/Menu.vue:6 가려짐 100%')
  })
})
