import { describe, expect, it } from 'vitest'
import {
  emptyGapPx,
  fieldClipPx,
  fixedHogPx,
  fixedOverlapPx,
  fragmentTarget,
  hasLonelyLastItem,
  isDeadZIndex,
  isFailedResource,
  isMixedContent,
  isOrphanLine,
  isTightLeading,
  isTinyFont,
  looksLikeNonCss,
  oversizedPx,
  stickyNeverSticks,
  triggersInputZoom,
  upscaleGapPx
} from '../src'

describe('타이포그래피', () => {
  it('12px 미만만 작은 글자다', () => {
    expect(isTinyFont(10)).toBe(true)
    expect(isTinyFont(12)).toBe(false)
    expect(isTinyFont(0)).toBe(false)
  })

  it('여러 줄 문단에서 줄 높이가 글자보다 작을 때만 줄이 붙은 것이다', () => {
    expect(isTightLeading(11.2, 14, 3)).toBe(true)
    expect(isTightLeading(14, 14, 3)).toBe(false)
    expect(isTightLeading(11.2, 14, 1)).toBe(false)
    expect(isTightLeading(Number.NaN, 14, 3)).toBe(false)
  })

  it('입력창 글자가 16px 미만이면 iOS 확대를 일으킨다', () => {
    expect(triggersInputZoom(14)).toBe(true)
    expect(triggersInputZoom(16)).toBe(false)
  })

  it('첫 줄은 넓고 마지막 줄이 한두 글자 크기일 때만 홀로 남은 줄이다', () => {
    expect(isOrphanLine([200, 12], 14)).toBe(true)
    expect(isOrphanLine([200, 80], 14)).toBe(false)
    expect(isOrphanLine([60, 12], 14)).toBe(false)
    expect(isOrphanLine([200], 14)).toBe(false)
  })
})

describe('이미지 해상도', () => {
  it('필요 픽셀이 원본의 1.25배 이상이면 흐릿하고 모자란 픽셀을 돌려준다', () => {
    expect(upscaleGapPx(80, 319, 1)).toBe(239)
    expect(upscaleGapPx(320, 319, 2)).toBe(318)
    expect(upscaleGapPx(640, 319, 1)).toBe(0)
  })

  it('원본이 800px 이상이고 필요의 3배 이상일 때만 과대 이미지다', () => {
    expect(oversizedPx(1600, 200, 1)).toBe(1400)
    expect(oversizedPx(640, 100, 1)).toBe(0)
    expect(oversizedPx(1600, 656, 1)).toBe(0)
  })
})

describe('고정 레이어', () => {
  const box = (left: number, top: number, right: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({ left, top, right, bottom })

  it('겹친 고정 요소는 겹친 변 중 작은 쪽을 돌려준다', () => {
    expect(fixedOverlapPx(box(300, 100, 356, 156), box(312, 108, 368, 164))).toBe(44)
    expect(fixedOverlapPx(box(0, 0, 50, 50), box(200, 0, 250, 50))).toBe(0)
  })

  it('화면의 35% 를 넘게 차지하면 넘는 양을 높이로 환산하고 아니면 0 이다', () => {
    expect(fixedHogPx(box(0, 487, 375, 812), { width: 375, height: 812 })).toBeCloseTo(40.6, 0)
    expect(fixedHogPx(box(0, 700, 375, 812), { width: 375, height: 812 })).toBe(0)
  })
})

describe('입력창·select 글 잘림', () => {
  it('글이 칸보다 2px 이상 길 때만 잘린 양을 돌려준다', () => {
    expect(fieldClipPx(180, 80)).toBe(100)
    expect(fieldClipPx(81, 80)).toBe(0)
  })
})

describe('효과 없는 CSS', () => {
  it('sticky 의 기준 조상이 스크롤되지 않으면 영원히 붙지 않는다', () => {
    expect(stickyNeverSticks({ overflowY: 'auto', scrollHeight: 300, clientHeight: 300 })).toBe(true)
    expect(stickyNeverSticks({ overflowY: 'auto', scrollHeight: 900, clientHeight: 300 })).toBe(false)
    expect(stickyNeverSticks({ overflowY: 'visible', scrollHeight: 300, clientHeight: 300 })).toBe(false)
  })

  it('static 인 요소의 z-index 는 효과가 없지만 flex/grid 아이템이면 있다', () => {
    expect(isDeadZIndex({ position: 'static', zIndex: '10' }, 'block')).toBe(true)
    expect(isDeadZIndex({ position: 'static', zIndex: '10' }, 'flex')).toBe(false)
    expect(isDeadZIndex({ position: 'relative', zIndex: '10' }, 'block')).toBe(false)
    expect(isDeadZIndex({ position: 'static', zIndex: 'auto' }, 'block')).toBe(false)
  })
})

describe('앵커 대상', () => {
  it('문서 안 이동 해시만 id 로 돌려주고 빈 해시와 해시 라우터는 제외한다', () => {
    expect(fragmentTarget('#reviews')).toBe('reviews')
    expect(fragmentTarget('#%EB%A6%AC%EB%B7%B0')).toBe('리뷰')
    expect(fragmentTarget('#')).toBeUndefined()
    expect(fragmentTarget('#/orders')).toBeUndefined()
    expect(fragmentTarget('#!top')).toBeUndefined()
  })
})

describe('페이지 건강', () => {
  it('이미지가 아닌 리소스의 4xx/5xx 만 실패다', () => {
    expect(isFailedResource({ initiatorType: 'link', responseStatus: 404 })).toBe(true)
    expect(isFailedResource({ initiatorType: 'img', responseStatus: 404 })).toBe(false)
    expect(isFailedResource({ initiatorType: 'script', responseStatus: 200 })).toBe(false)
  })

  it('HTTPS 페이지의 http:// 리소스만 혼합 콘텐츠다', () => {
    expect(isMixedContent('https:', 'http://cdn.example.com/a.js')).toBe(true)
    expect(isMixedContent('https:', 'https://cdn.example.com/a.js')).toBe(false)
    expect(isMixedContent('http:', 'http://localhost:5173/a.js')).toBe(false)
  })

  it('본문은 있는데 CSS 규칙이 0개면 CSS 가 아닌 응답으로 본다', () => {
    expect(looksLikeNonCss(0, 368)).toBe(true)
    expect(looksLikeNonCss(0, 10)).toBe(false)
    expect(looksLikeNonCss(12, 368)).toBe(false)
  })
})

describe('레이아웃 빈틈', () => {
  it('상자가 160px 이상이고 내용 아래 빈 공간이 120px·절반 이상일 때만 빈 영역이다', () => {
    expect(emptyGapPx(264, 70)).toBe(194)
    expect(emptyGapPx(150, 20)).toBe(0)
    expect(emptyGapPx(400, 300)).toBe(0)
  })

  it('같은 크기 항목이 N,N,1 로 줄바꿈되면 외톨이다', () => {
    expect(hasLonelyLastItem([3, 1], [100, 100, 100, 100])).toBe(true)
    expect(hasLonelyLastItem([2, 2], [100, 100, 100, 100])).toBe(false)
    expect(hasLonelyLastItem([3, 1], [100, 100, 100, 140])).toBe(false)
    expect(hasLonelyLastItem([1, 1], [100, 100])).toBe(false)
  })
})
