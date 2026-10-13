import { describe, expect, it } from 'vitest'
import { checkApiRequest, parseAllowedHosts } from './request-guard'

const call = (overrides: Partial<Parameters<typeof checkApiRequest>[0]> = {}, extra: string[] = []) =>
  checkApiRequest({ method: 'POST', host: 'localhost:3000', origin: undefined, ...overrides }, extra)

describe('checkApiRequest', () => {
  it('Origin 이 없는 요청(MCP 서버, CLI)은 통과한다', () => {
    expect(call()).toEqual({ allowed: true })
    expect(call({ host: '127.0.0.1:3000' })).toEqual({ allowed: true })
    expect(call({ host: '[::1]:3000' })).toEqual({ allowed: true })
  })

  it('같은 출처(대시보드 화면)와 Chrome 확장의 쓰기 요청은 통과한다', () => {
    expect(call({ origin: 'http://localhost:3000' })).toEqual({ allowed: true })
    expect(call({ origin: 'chrome-extension://abcdefghijklmnop' })).toEqual({ allowed: true })
  })

  it('다른 웹사이트의 쓰기 요청은 거부한다 (본문 없는 apply 같은 단순 POST 포함)', () => {
    const result = call({ origin: 'http://evil.example' })
    expect(result.allowed).toBe(false)
    expect(call({ origin: 'null' }).allowed).toBe(false)
    expect(call({ origin: 'http://localhost:3001' }).allowed).toBe(false)
  })

  it('읽기 요청은 Origin 이 달라도 서버에서는 막지 않는다 (브라우저가 CORS 헤더 없이 응답을 숨긴다)', () => {
    expect(call({ method: 'GET', origin: 'http://evil.example' })).toEqual({ allowed: true })
  })

  it('DNS 리바인딩: Host 가 로컬 주소가 아니면 Origin 이 같아도 거부한다', () => {
    expect(call({ host: 'evil.example:3000', origin: 'http://evil.example:3000' }).allowed).toBe(false)
    expect(call({ host: 'evil.example:3000', method: 'GET' }).allowed).toBe(false)
    expect(call({ host: undefined }).allowed).toBe(false)
  })

  it('INSPECTOR_ALLOWED_HOSTS 로 추가한 호스트는 허용한다', () => {
    expect(call({ host: 'dev-box:3000' }, parseAllowedHosts('dev-box, Other')).allowed).toBe(true)
    expect(call({ host: 'dev-box:3000' }).allowed).toBe(false)
  })
})

describe('parseAllowedHosts', () => {
  it('공백과 빈 값을 정리하고 소문자로 맞춘다', () => {
    expect(parseAllowedHosts(' A , ,b ')).toEqual(['a', 'b'])
    expect(parseAllowedHosts('')).toEqual([])
  })
})
