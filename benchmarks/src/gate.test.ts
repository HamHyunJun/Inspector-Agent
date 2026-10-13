import { describe, expect, it } from 'vitest'
import { findDetectionRegressions } from './gate'

const healthy = { recall: 1, precision: 1, negativeControlHits: 0, desktopDefects: 0, cascadeMismatches: 0, groupingMismatches: 0, scenarioMismatches: 0, scenarioRemeasureMismatches: 0 }

describe('findDetectionRegressions', () => {
  it('불변 조건이 모두 지켜지면 문제가 없다', () => {
    expect(findDetectionRegressions(healthy)).toEqual([])
  })

  it('정답을 놓치거나(재현율), 정답표에 없는 결함을 잡으면(정밀도) 실패 사유를 낸다', () => {
    expect(findDetectionRegressions({ ...healthy, recall: 0.875 })[0]).toContain('재현율 87.5%')
    expect(findDetectionRegressions({ ...healthy, precision: 0.8 })[0]).toContain('정밀도 80.0%')
  })

  it('대조군 오탐과 데스크톱 결함은 한 건만 있어도 실패 사유를 낸다', () => {
    const problems = findDetectionRegressions({ ...healthy, negativeControlHits: 1, desktopDefects: 2 })
    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toContain('대조군 오탐 1건')
    expect(problems.join('\n')).toContain('1280px 결함 2건')
  })

  it('여러 조건이 동시에 깨지면 모두 알려 준다', () => {
    expect(findDetectionRegressions({ recall: 0.5, precision: 0.5, negativeControlHits: 3, desktopDefects: 1, cascadeMismatches: 1, groupingMismatches: 1, scenarioMismatches: 1, scenarioRemeasureMismatches: 1 })).toHaveLength(8)
  })

  it('시나리오 결함이 정답과 다르거나 재측정이 시나리오를 무시하면 실패 사유를 낸다', () => {
    expect(findDetectionRegressions({ ...healthy, scenarioMismatches: 1 })[0]).toContain('시나리오 전용 결함')
    expect(findDetectionRegressions({ ...healthy, scenarioRemeasureMismatches: 1 })[0]).toContain('재측정이 시나리오를 반영하지 않음')
  })

  it('연쇄 결함이 따로 나오거나 URL 그룹이 안 묶이면 실패 사유를 낸다', () => {
    expect(findDetectionRegressions({ ...healthy, cascadeMismatches: 1 })[0]).toContain('연쇄 결함')
    expect(findDetectionRegressions({ ...healthy, groupingMismatches: 2 })[0]).toContain('한 그룹')
  })

  it('React 대상에서 정답 스타일시트를 못 찾아 고치지 못하면 실패 사유를 낸다', () => {
    expect(findDetectionRegressions({ ...healthy, styleLocationMismatches: 0 })).toEqual([])
    expect(findDetectionRegressions({ ...healthy, styleLocationMismatches: 2 })[0]).toContain('정답 스타일시트')
  })
})
