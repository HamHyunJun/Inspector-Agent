import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEWPORTS, parseViewports } from '../src'

describe('parseViewports', () => {
  it('너비만 주면 높이는 900, 너비x높이면 그대로 쓴다', () => {
    expect(parseViewports('375, 768x1024')).toEqual([
      { width: 375, height: 900 },
      { width: 768, height: 1024 }
    ])
  })

  it('기본 뷰포트는 375/768/1280 이다', () => {
    expect(DEFAULT_VIEWPORTS.map((viewport): number => viewport.width)).toEqual([375, 768, 1280])
  })
})
