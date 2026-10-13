import { describe, expect, it } from 'vitest'
import { MAX_SCENARIO_STEPS, MAX_WAIT_MS, parseScenario, qualifyDefectId, scenarioKey, toStorageString } from '../src'

describe('parseScenario', () => {
  it('시드와 단계를 모두 가진 시나리오를 받아들인다', () => {
    const scenario = parseScenario({
      name: '드롭다운 열기',
      seed: { localStorage: { user: { name: '함현준' } }, sessionStorage: { tab: '2' }, cookies: [{ name: 'sid', value: 'x', path: '/' }] },
      steps: [{ action: 'click', selector: '.trigger' }, { action: 'hover', selector: '.tip-trigger' }, { action: 'fill', selector: 'input', value: 'a' }, { action: 'wait', ms: 300 }, { action: 'wait', selector: '.menu' }]
    })
    expect(scenario.steps).toHaveLength(5)
    expect(scenario.seed?.cookies?.[0]).toEqual({ name: 'sid', value: 'x', path: '/' })
  })

  it('seed 만 있거나 steps 만 있어도 된다', () => {
    expect(parseScenario({ seed: { localStorage: { a: 1 } } }).steps).toBeUndefined()
    expect(parseScenario({ steps: [{ action: 'click', selector: 'button' }] }).seed).toBeUndefined()
  })

  it.each([
    [null, '객체'],
    [[], '객체'],
    [{}, 'seed 또는 steps'],
    [{ steps: [] }, 'seed 또는 steps'],
    [{ stepz: [] }, '알 수 없는 필드 "stepz"'],
    [{ steps: [{ action: 'drag', selector: 'a' }] }, '"click", "hover", "fill", "wait"'],
    [{ steps: [{ action: 'hover' }] }, 'selector'],
    [{ steps: [{ action: 'click' }] }, 'selector'],
    [{ steps: [{ action: 'click', selector: 'a', extra: 1 }] }, '알 수 없는 필드 "extra"'],
    [{ steps: [{ action: 'fill', selector: 'a' }] }, 'value'],
    [{ steps: [{ action: 'wait' }] }, 'ms 와 selector 중 하나'],
    [{ steps: [{ action: 'wait', ms: 1, selector: 'a' }] }, 'ms 와 selector 중 하나'],
    [{ steps: [{ action: 'wait', ms: MAX_WAIT_MS + 1 }] }, '0~10000'],
    [{ steps: [{ action: 'wait', ms: -1 }] }, '0~10000'],
    [{ seed: { localStorage: 'x' } }, '객체'],
    [{ seed: { cookies: [{ name: 'a' }] } }, 'value'],
    [{ seed: { cookies: [{ name: 'a', value: 'b', domain: 'evil.example' }] } }, '알 수 없는 필드 "domain"'],
    [{ seed: { other: {} } }, '알 수 없는 필드 "other"']
  ])('잘못된 입력을 거부한다: %j', (input, message) => {
    expect(() => parseScenario(input)).toThrow(message)
  })

  it('단계 수와 시드 크기에 상한이 있다', () => {
    const steps = Array.from({ length: MAX_SCENARIO_STEPS + 1 }, () => ({ action: 'click', selector: 'a' }))
    expect(() => parseScenario({ steps })).toThrow(`${MAX_SCENARIO_STEPS}개 이하`)
    expect(() => parseScenario({ seed: { localStorage: { big: 'x'.repeat(600 * 1024) } } })).toThrow('KB 이하')
  })

  it('오류 메시지에 어느 단계인지 담는다', () => {
    expect(() => parseScenario({ steps: [{ action: 'click', selector: 'a' }, { action: 'click' }] })).toThrow('steps[1].selector')
  })
})

describe('scenarioKey / qualifyDefectId', () => {
  it('키 순서나 name 이 달라도 내용이 같으면 같은 키, 내용이 다르면 다른 키', () => {
    const a = parseScenario({ name: 'A', seed: { localStorage: { x: 1, y: 2 } }, steps: [{ action: 'click', selector: 'b' }] })
    const b = parseScenario({ name: 'B', steps: [{ selector: 'b', action: 'click' }], seed: { localStorage: { y: 2, x: 1 } } })
    const c = parseScenario({ seed: { localStorage: { x: 1, y: 3 } }, steps: [{ action: 'click', selector: 'b' }] })
    expect(scenarioKey(a)).toBe(scenarioKey(b))
    expect(scenarioKey(a)).not.toBe(scenarioKey(c))
    expect(scenarioKey(a)).toMatch(/^s_[0-9a-f]{8}$/)
  })

  it('시나리오 결함 id 는 같은 URL 의 일반 결함 id 나 다른 시나리오의 id 와 겹치지 않는다', () => {
    const id = 'd_12345678'
    expect(qualifyDefectId(id, 's_aaaaaaaa')).not.toBe(id)
    expect(qualifyDefectId(id, 's_aaaaaaaa')).not.toBe(qualifyDefectId(id, 's_bbbbbbbb'))
    expect(qualifyDefectId(id, 's_aaaaaaaa')).toBe(qualifyDefectId(id, 's_aaaaaaaa'))
  })
})

describe('toStorageString', () => {
  it('문자열은 그대로, 객체와 숫자는 JSON 으로 넣는다', () => {
    expect(toStorageString('abc')).toBe('abc')
    expect(toStorageString({ a: [1] })).toBe('{"a":[1]}')
    expect(toStorageString(3)).toBe('3')
  })
})
