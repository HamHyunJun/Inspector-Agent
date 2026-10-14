import { describe, expect, it } from 'vitest'
import { diagnoseBrokenImage, isBrokenImage } from '../src'
import type { NodeSnapshot, OverflowMetrics } from '../src'

describe('isBrokenImage (로드에 실패한 이미지)', () => {
  it('로드가 끝났는데 그릴 이미지가 없으면 깨진 것이다', () => {
    expect(isBrokenImage({ complete: true, naturalWidth: 0, currentSrc: '/images/hero-mobile.webp' })).toBe(true)
  })

  it('아직 로드 중이면(complete: false) 깨진 것이 아니다', () => {
    expect(isBrokenImage({ complete: false, naturalWidth: 0, currentSrc: '/images/hero.webp' })).toBe(false)
  })

  it('정상 로드된 이미지는 깨진 것이 아니다', () => {
    expect(isBrokenImage({ complete: true, naturalWidth: 160, currentSrc: '/thumb.png' })).toBe(false)
  })

  it('src 가 없는 이미지(자리표시자)는 깨진 것이 아니다', () => {
    expect(isBrokenImage({ complete: true, naturalWidth: 0, currentSrc: '' })).toBe(false)
  })
})

describe('diagnoseBrokenImage', () => {
  const node = { selector: 'img.hero__img', tag: 'img', classes: ['hero__img'], rect: { x: 0, y: 0, width: 16, height: 16, right: 16, bottom: 16 }, scrollWidth: 16, clientWidth: 16, styles: {}, childElementCount: 0, childClasses: [] } as NodeSnapshot
  const metrics: OverflowMetrics = { kind: 'overflow-x', mode: 'broken-image', overflowPx: 16, overflowRatio: 1, parentContentWidth: 343, nodeWidth: 16 }

  it('경로 문제라 선언 없이 원인 확인 안내만 한다(자동 패치 대상 아님)', () => {
    const [suggestion, ...rest] = diagnoseBrokenImage(node, metrics, '/images/hero-mobile.webp')
    expect(rest).toEqual([])
    expect(suggestion).toMatchObject({ hint: 'image-load-failed', declarations: {} })
    expect(suggestion?.reason).toContain('/images/hero-mobile.webp')
  })
})
