import { describe, expect, it } from 'vitest'
import type { NodeSnapshot, Severity } from '@inspector-agent/core'
import type { DefectStatus, StoredDefect } from '../../shared/types/inspector'
import { aggregateStatus, summarizeGroups } from './defect-groups'

const snapshot = (): NodeSnapshot => ({
  selector: 'span.name',
  tag: 'span',
  classes: [],
  rect: { x: 0, y: 0, width: 10, height: 10, right: 10, bottom: 10 },
  scrollWidth: 10,
  clientWidth: 10,
  styles: {},
  childElementCount: 0,
  childClasses: []
})

const defect = (url: string, fingerprint: string, overrides: { status?: DefectStatus; severity?: Severity; overflowPx?: number } = {}): StoredDefect => ({
  id: `d_${url}_${fingerprint}`,
  fingerprint,
  kind: 'overflow-x',
  severity: overrides.severity ?? 'high',
  url,
  viewport: { width: 375, height: 812 },
  node: snapshot(),
  parent: snapshot(),
  metrics: { kind: 'overflow-x', mode: 'box', overflowPx: overrides.overflowPx ?? 40, overflowRatio: 0.1, parentContentWidth: 300, nodeWidth: 340 },
  suggestions: [],
  detectedAt: '',
  status: overrides.status ?? 'open',
  firstSeenAt: '',
  lastSeenAt: '',
  occurrences: 1
})

describe('aggregateStatus', () => {
  it('하나라도 open 이면 open, 아니면 patched, 모두 resolved 일 때만 resolved', () => {
    expect(aggregateStatus(['resolved', 'open'])).toBe('open')
    expect(aggregateStatus(['resolved', 'patched'])).toBe('patched')
    expect(aggregateStatus(['resolved', 'resolved'])).toBe('resolved')
  })
})

describe('summarizeGroups', () => {
  it('같은 소스 위치·뷰포트는 URL 이 달라도 한 그룹이고 발생 URL 목록을 담는다 (D2)', () => {
    const groups = summarizeGroups([defect('http://x/camps/c1', 'f1'), defect('http://x/camps/c2', 'f1'), defect('http://x/', 'f2')])
    expect(groups).toHaveLength(2)
    const grouped = groups.find((group): boolean => group.key === 'f1')
    expect(grouped?.members.map((member): string => member.url)).toEqual(['http://x/camps/c1', 'http://x/camps/c2'])
  })

  it('그룹 상태는 URL 별 상태를 합쳐서 정한다 (한 URL 이라도 미해결이면 미해결)', () => {
    const groups = summarizeGroups([defect('http://x/a', 'f1', { status: 'resolved' }), defect('http://x/b', 'f1', { status: 'open' })])
    expect(groups[0]?.status).toBe('open')
  })

  it('심각도 순, 같으면 큰 것 순으로 정렬한다', () => {
    const groups = summarizeGroups([defect('http://x', 'low', { severity: 'low' }), defect('http://x', 'small', { overflowPx: 10 }), defect('http://x', 'big', { overflowPx: 90 })])
    expect(groups.map((group): string => group.key)).toEqual(['big', 'small', 'low'])
  })
})
