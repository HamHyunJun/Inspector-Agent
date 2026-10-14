import { describe, expect, it } from 'vitest'
import { baselineKey } from '../src/store'

describe('baselineKey', () => {
  it('시나리오가 없으면 기존 키 형식을 유지한다', () => {
    expect(baselineKey('http://x/a', 375)).toBe('http://x/a|375')
  })

  it('시나리오 키가 다르면 같은 URL·뷰포트라도 다른 기준선이다', () => {
    expect(baselineKey('http://x/a', 375, 's_aaaaaaaa')).toBe('http://x/a|375|s_aaaaaaaa')
    expect(baselineKey('http://x/a', 375, 's_aaaaaaaa')).not.toBe(baselineKey('http://x/a', 375, 's_bbbbbbbb'))
    expect(baselineKey('http://x/a', 375, 's_aaaaaaaa')).not.toBe(baselineKey('http://x/a', 375))
  })
})
