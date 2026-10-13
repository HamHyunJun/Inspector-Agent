import { describe, expect, it } from 'vitest'
import type { Scenario } from '@inspector-agent/core'
import type { BrowserContext, Page } from 'playwright-core'
import { runScenarioSteps, seedContext } from '../src/scenario'

const fakeContext = (): { context: BrowserContext; cookies: unknown[]; initScripts: Array<{ arg: unknown }> } => {
  const cookies: unknown[] = []
  const initScripts: Array<{ arg: unknown }> = []
  const context = {
    addCookies: async (value: unknown[]): Promise<void> => {
      cookies.push(...value)
    },
    addInitScript: async (_script: unknown, arg: unknown): Promise<void> => {
      initScripts.push({ arg })
    }
  } as unknown as BrowserContext
  return { context, cookies, initScripts }
}

describe('seedContext', () => {
  it('저장소 값은 문자열로 바꿔(객체는 JSON) 페이지가 뜨기 전에 실행되는 초기화 스크립트로 넘긴다', async () => {
    const { context, initScripts } = fakeContext()
    await seedContext(context, 'http://localhost:5174/', {
      seed: { localStorage: { camp: { camps: [1] }, plain: 'x' }, sessionStorage: { tab: 2 } }
    })
    expect(initScripts).toEqual([{ arg: { local: { camp: '{"camps":[1]}', plain: 'x' }, session: { tab: '2' } } }])
  })

  it('쿠키는 스캔하는 URL 의 호스트에만 설정한다 (path 가 있으면 도메인과 path, 없으면 url)', async () => {
    const { context, cookies } = fakeContext()
    await seedContext(context, 'http://localhost:5174/camps', { seed: { cookies: [{ name: 'a', value: '1' }, { name: 'b', value: '2', path: '/api' }] } })
    expect(cookies).toEqual([
      { name: 'a', value: '1', url: 'http://localhost:5174/camps' },
      { name: 'b', value: '2', domain: 'localhost', path: '/api' }
    ])
  })

  it('시드가 없거나 steps 만 있는 시나리오는 아무것도 심지 않는다', async () => {
    const { context, cookies, initScripts } = fakeContext()
    await seedContext(context, 'http://localhost/', { steps: [{ action: 'click', selector: 'a' }] })
    expect(cookies).toEqual([])
    expect(initScripts).toEqual([])
  })
})

const fakePage = (failOn?: string): { page: Page; calls: string[] } => {
  const calls: string[] = []
  const record =
    (name: string) =>
    async (...args: unknown[]): Promise<void> => {
      const label = `${name} ${String(args[0])}`
      calls.push(label)
      if (failOn === label) throw new Error(`Timeout 5000ms exceeded.\n  - waiting for locator`)
    }
  const page = { click: record('click'), fill: record('fill'), waitForSelector: record('waitForSelector'), waitForTimeout: record('waitForTimeout') } as unknown as Page
  return { page, calls }
}

describe('runScenarioSteps', () => {
  const steps: NonNullable<Scenario['steps']> = [
    { action: 'click', selector: '.trigger' },
    { action: 'fill', selector: 'input', value: 'v' },
    { action: 'wait', selector: '.menu' },
    { action: 'wait', ms: 200 }
  ]

  it('단계를 적은 순서대로 실행한다', async () => {
    const { page, calls } = fakePage()
    await runScenarioSteps(page, steps)
    expect(calls).toEqual(['click .trigger', 'fill input', 'waitForSelector .menu', 'waitForTimeout 200'])
  })

  it('실패하면 몇 번째 단계인지와 원인 첫 줄을 담은 오류를 던지고 이후 단계는 실행하지 않는다', async () => {
    const { page, calls } = fakePage('fill input')
    await expect(runScenarioSteps(page, steps)).rejects.toThrow('시나리오 steps[1] (fill input) 실패: Timeout 5000ms exceeded.')
    expect(calls).toEqual(['click .trigger', 'fill input'])
  })
})
