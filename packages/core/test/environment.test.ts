import { describe, expect, it } from 'vitest'
import { extendText, parseScenario, scenarioKey } from '../src'

describe('시나리오 environment 검증', () => {
  it('환경만 있어도 시나리오가 된다', () => {
    expect(parseScenario({ name: '다크', environment: { colorScheme: 'dark' } })).toEqual({ name: '다크', environment: { colorScheme: 'dark' } })
  })

  it('허용된 항목을 모두 받는다', () => {
    const environment = { colorScheme: 'dark', forcedColors: true, textScale: 2, longText: true, direction: 'rtl', device: 'iphone', engine: 'webkit' }
    expect(parseScenario({ environment }).environment).toEqual(environment)
  })

  it('알 수 없는 필드와 잘못된 값은 한국어 오류로 거절한다', () => {
    expect(() => parseScenario({ environment: { theme: 'dark' } })).toThrow('알 수 없는 필드')
    expect(() => parseScenario({ environment: { textScale: 5 } })).toThrow('textScale')
    expect(() => parseScenario({ environment: { textScale: 1 } })).toThrow('textScale')
    expect(() => parseScenario({ environment: { device: 'nokia' } })).toThrow('device')
    expect(() => parseScenario({ environment: { engine: 'chromium' } })).toThrow('engine')
    expect(() => parseScenario({ environment: { direction: 'ltr' } })).toThrow('direction')
    expect(() => parseScenario({ environment: {} })).toThrow('하나 이상')
  })

  it('false 로 끈 항목은 환경에 남기지 않는다', () => {
    expect(() => parseScenario({ environment: { forcedColors: false } })).toThrow('하나 이상')
  })

  it('seed, steps, environment 가 모두 없으면 거절한다', () => {
    expect(() => parseScenario({ name: '빈 시나리오' })).toThrow('seed, steps, environment')
  })
})

describe('시나리오 키', () => {
  it('environment 가 없는 기존 시나리오의 키는 이전 버전과 같다(저장된 결함과 어긋나지 않는다)', () => {
    // 아래 값은 environment 를 도입하기 전 구현으로 계산한 것이다
    expect(scenarioKey({ seed: { localStorage: { a: 1 } }, steps: [{ action: 'click', selector: '#a' }] })).toBe('s_e46bd050')
    expect(scenarioKey({ seed: { localStorage: { 'ia-demo-nickname': 'x' } } })).toBe('s_035aeb61')
  })

  it('환경이 다르면 키가 다르고, 이름은 키에 영향이 없다', () => {
    const dark = scenarioKey({ environment: { colorScheme: 'dark' } })
    expect(dark).not.toBe(scenarioKey({ environment: { textScale: 2 } }))
    expect(dark).toBe(scenarioKey({ name: '다른 이름', environment: { colorScheme: 'dark' } }))
  })
})

describe('긴 글 늘리기', () => {
  it('여러 단어면 단어 경계에서 자른 앞쪽 절반을 이어 붙인다', () => {
    expect(extendText('결제 완료 안내 문구')).toBe('결제 완료 안내 문구 결제 완료')
  })

  it('한 단어면 두 번 반복한다', () => {
    expect(extendText('결제완료')).toBe('결제완료 결제완료')
  })
})
