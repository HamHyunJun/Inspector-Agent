import { describe, expect, it } from 'vitest'
import { groupDefects } from '../src'
import type { Defect, NodeSnapshot, Severity } from '../src'

const snapshot = (): NodeSnapshot => ({
  selector: 'span.name',
  tag: 'span',
  classes: ['name'],
  rect: { x: 0, y: 0, width: 100, height: 20, right: 100, bottom: 20 },
  scrollWidth: 100,
  clientWidth: 100,
  styles: {},
  childElementCount: 0,
  childClasses: []
})

const defect = (url: string, overflowPx: number, severity: Severity = 'high', fingerprint = 'overflow-x|src/A.vue:4:5|375'): Defect => ({
  id: `d_${url}_${overflowPx}`,
  fingerprint,
  kind: 'overflow-x',
  severity,
  url,
  viewport: { width: 375, height: 812 },
  node: snapshot(),
  parent: snapshot(),
  metrics: { kind: 'overflow-x', mode: 'box', overflowPx, overflowRatio: 0.1, parentContentWidth: 300, nodeWidth: 400 },
  suggestions: [],
  detectedAt: ''
})

describe('groupDefects', () => {
  it('같은 지문의 결함은 URL 이 달라도 한 그룹으로 묶는다', () => {
    const groups = groupDefects([defect('http://x/camps/c1', 40), defect('http://x/camps/c2', 44)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.members.map((member): string => member.url)).toEqual(['http://x/camps/c1', 'http://x/camps/c2'])
  })

  it('대표는 가장 심각한 결함이고, 심각도가 같으면 더 큰 쪽이며, 같으면 먼저 발견된 쪽이다', () => {
    expect(groupDefects([defect('a', 10, 'low'), defect('b', 5, 'high')])[0]?.representative.url).toBe('b')
    expect(groupDefects([defect('a', 10), defect('b', 30)])[0]?.representative.url).toBe('b')
    expect(groupDefects([defect('a', 10), defect('b', 10)])[0]?.representative.url).toBe('a')
  })

  it('지문(소스 위치, 뷰포트)이 다르면 다른 그룹이고, 그룹 순서는 처음 등장한 순서를 따른다', () => {
    const groups = groupDefects([
      defect('a', 10, 'high', 'overflow-x|src/A.vue:4:5|375'),
      defect('a', 10, 'high', 'overflow-x|src/B.vue:2:3|375'),
      defect('b', 10, 'high', 'overflow-x|src/A.vue:4:5|375'),
      defect('a', 10, 'high', 'overflow-x|src/A.vue:4:5|1280')
    ])
    expect(groups.map((group): string => group.key)).toEqual([
      'overflow-x|src/A.vue:4:5|375',
      'overflow-x|src/B.vue:2:3|375',
      'overflow-x|src/A.vue:4:5|1280'
    ])
    expect(groups[0]?.members).toHaveLength(2)
  })

  it('빈 입력은 빈 배열', () => {
    expect(groupDefects([])).toEqual([])
  })
})
