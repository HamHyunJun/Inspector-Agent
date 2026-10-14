import { describe, expect, it } from 'vitest'
import { contextOptionsFor, defectSignature, deviceViewport, needsPageEnvironment, parseVariants, VARIANT_NAMES } from '../src/variants'

describe('parseVariants', () => {
  it('쉼표로 구분한 이름을 환경 시나리오로 바꾼다', () => {
    const [dark, scale] = parseVariants('dark, text-scale')
    expect(dark?.scenario).toMatchObject({ environment: { colorScheme: 'dark' } })
    expect(scale?.scenario).toMatchObject({ environment: { textScale: 2 } })
  })

  it('배열도 받고 중복은 하나로 합친다', () => {
    expect(parseVariants(['dark', 'dark', 'rtl'])).toHaveLength(2)
  })

  it('all 은 장치와 다른 엔진을 뺀 여섯 개로 펼친다', () => {
    const variants = parseVariants('all')
    expect(variants).toHaveLength(6)
    expect(variants.some((variant): boolean => variant.landscape === true)).toBe(true)
    expect(variants.every((variant): boolean => variant.scenario?.environment?.device === undefined && variant.scenario?.environment?.engine === undefined)).toBe(true)
  })

  it('가로 모드는 환경이 아니라 뷰포트 변경이다', () => {
    expect(parseVariants('landscape')).toEqual([{ name: '환경: 가로 모드', landscape: true }])
  })

  it('장치와 엔진 이름을 환경으로 바꾼다', () => {
    expect(parseVariants('device:iphone')[0]?.scenario?.environment).toEqual({ device: 'iphone' })
    expect(parseVariants('engine:webkit')[0]?.scenario?.environment).toEqual({ engine: 'webkit' })
  })

  it('비어 있으면 변형이 없다', () => {
    expect(parseVariants(undefined)).toEqual([])
    expect(parseVariants('')).toEqual([])
  })

  it('알 수 없는 이름은 가능한 값을 알려 주며 거절한다', () => {
    expect(() => parseVariants('sepia')).toThrow(`알 수 없는 환경 변형 "sepia"`)
    expect(() => parseVariants('device:nokia')).toThrow(VARIANT_NAMES[0]!)
    expect(() => parseVariants('engine:chromium')).toThrow('알 수 없는 환경 변형')
  })
})

describe('환경 → 브라우저 컨텍스트', () => {
  it('다크 모드와 고대비는 컨텍스트 옵션이 된다', () => {
    expect(contextOptionsFor({ colorScheme: 'dark', forcedColors: true })).toMatchObject({ colorScheme: 'dark', forcedColors: 'active' })
  })

  it('장치는 화면 크기, 배율, 터치를 함께 바꾼다', () => {
    expect(contextOptionsFor({ device: 'iphone' })).toMatchObject({ deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    expect(deviceViewport('iphone').width).toBe(390)
  })

  it('환경이 없거나 페이지 안 환경뿐이면 컨텍스트 옵션이 비어 있다', () => {
    expect(contextOptionsFor(undefined)).toEqual({})
    expect(contextOptionsFor({ textScale: 2 })).toEqual({})
  })

  it('글자 확대·긴 글·RTL 만 페이지 안에서 적용한다', () => {
    expect(needsPageEnvironment({ textScale: 2 })).toBe(true)
    expect(needsPageEnvironment({ longText: true })).toBe(true)
    expect(needsPageEnvironment({ direction: 'rtl' })).toBe(true)
    expect(needsPageEnvironment({ colorScheme: 'dark' })).toBe(false)
    expect(needsPageEnvironment(undefined)).toBe(false)
  })
})

describe('defectSignature', () => {
  it('뷰포트 너비를 뺀 서명이라 다른 너비의 같은 결함이 같다', () => {
    expect(defectSignature('overflow-x:overlap|src/A.vue:3:5|375')).toBe(defectSignature('overflow-x:overlap|src/A.vue:3:5|1280'))
    expect(defectSignature('overflow-x:overlap|src/A.vue:3:5|375')).not.toBe(defectSignature('overflow-x:tap-target|src/A.vue:3:5|375'))
  })
})
