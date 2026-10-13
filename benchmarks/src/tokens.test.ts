import { describe, expect, it } from 'vitest'
import { createTokenCounter } from './tokens'
import type { CountTokensClient } from './tokens'

const fakeClient = (log: Array<{ model: string; content: string }> = []): CountTokensClient => ({
  messages: {
    countTokens: async ({ model, messages }): Promise<{ input_tokens: number }> => {
      const content = messages[0]?.content ?? ''
      log.push({ model, content })
      return { input_tokens: content.length }
    }
  }
})

describe('createTokenCounter', () => {
  it('API 방식은 count_tokens 에 모델과 본문을 그대로 보내고 입력 토큰 수를 돌려준다', async () => {
    const log: Array<{ model: string; content: string }> = []
    const counter = await createTokenCounter({ client: fakeClient(log), model: 'claude-test' })
    expect(counter).toMatchObject({ method: 'api', model: 'claude-test' })
    expect(await counter.count('abcdef')).toBe(6)
    expect(log.at(-1)).toEqual({ model: 'claude-test', content: 'abcdef' })
  })

  it('빈 문자열은 거부당하지 않도록 공백 한 글자로 보낸다', async () => {
    const log: Array<{ model: string; content: string }> = []
    const counter = await createTokenCounter({ client: fakeClient(log) })
    await counter.count('')
    expect(log.at(-1)?.content).toBe(' ')
  })

  it('자격 증명이 없어 첫 호출이 실패하면 해결 방법을 담아 즉시 실패한다', async () => {
    const failing: CountTokensClient = {
      messages: {
        countTokens: async (): Promise<{ input_tokens: number }> => {
          throw new Error('Could not resolve authentication method')
        }
      }
    }
    await expect(createTokenCounter({ client: failing })).rejects.toThrow(/ANTHROPIC_API_KEY.*INSPECTOR_BENCH_ESTIMATE=1/s)
  })

  it('명시적으로 estimate 를 켜면 API 를 부르지 않고 4자당 1토큰으로 센다', async () => {
    const counter = await createTokenCounter({ estimate: true, client: undefined })
    expect(counter.method).toBe('estimate')
    expect(await counter.count('12345678')).toBe(2)
  })
})
