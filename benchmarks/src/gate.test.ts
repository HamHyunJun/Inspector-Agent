import { describe, expect, it } from 'vitest'
import { findDetectionRegressions } from './gate'

const healthy = { recall: 1, precision: 1, negativeControlHits: 0, desktopDefects: 0 }

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
    expect(findDetectionRegressions({ recall: 0.5, precision: 0.5, negativeControlHits: 3, desktopDefects: 1 })).toHaveLength(4)
  })
})
