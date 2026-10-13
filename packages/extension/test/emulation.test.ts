import { describe, expect, it } from 'vitest'
import { MAX_EMULATED_WIDTH, MIN_EMULATED_WIDTH, viewportForWidth, withViewportEmulation } from '../src/emulation'
import type { DebuggerApi } from '../src/emulation'

const fakeApi = (failOn?: 'attach' | 'set' | 'clear'): { api: DebuggerApi; calls: string[] } => {
  const calls: string[] = []
  const api: DebuggerApi = {
    attach: async (): Promise<void> => {
      calls.push('attach')
      if (failOn === 'attach') throw new Error('Another debugger is already attached')
    },
    sendCommand: async (_target, method): Promise<unknown> => {
      calls.push(method)
      if (failOn === 'set' && method === 'Emulation.setDeviceMetricsOverride') throw new Error('set 실패')
      if (failOn === 'clear' && method === 'Emulation.clearDeviceMetricsOverride') throw new Error('clear 실패')
      return undefined
    },
    detach: async (): Promise<void> => {
      calls.push('detach')
    }
  }
  return { api, calls }
}

describe('withViewportEmulation', () => {
  it('붙이기 → 폭 설정 → 작업 → 원복 → 해제 순서로 호출하고 작업 결과를 돌려준다', async () => {
    const { api, calls } = fakeApi()
    const result = await withViewportEmulation(api, 7, viewportForWidth(375), async () => {
      calls.push('task')
      return 'ok'
    }, 0)
    expect(result).toBe('ok')
    expect(calls).toEqual(['attach', 'Emulation.setDeviceMetricsOverride', 'task', 'Emulation.clearDeviceMetricsOverride', 'detach'])
  })

  it('작업이 실패해도 원복하고 디버거를 뗀 뒤 원래 오류를 던진다', async () => {
    const { api, calls } = fakeApi()
    await expect(
      withViewportEmulation(api, 7, viewportForWidth(375), async () => {
        throw new Error('탐지 실패')
      }, 0)
    ).rejects.toThrow('탐지 실패')
    expect(calls.slice(-2)).toEqual(['Emulation.clearDeviceMetricsOverride', 'detach'])
  })

  it('원복 명령이 실패해도 디버거 해제는 반드시 시도한다', async () => {
    const { api, calls } = fakeApi('clear')
    await expect(withViewportEmulation(api, 7, viewportForWidth(375), async () => 'x', 0)).rejects.toThrow('clear 실패')
    expect(calls.at(-1)).toBe('detach')
  })

  it('폭 설정이 실패해도 원복과 해제를 거친다', async () => {
    const { api, calls } = fakeApi('set')
    await expect(withViewportEmulation(api, 7, viewportForWidth(375), async () => 'x', 0)).rejects.toThrow('set 실패')
    expect(calls).toEqual(['attach', 'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride', 'detach'])
  })

  it('디버거를 붙이지 못하면 아무것도 바꾸지 않고(원복·해제 호출 없음) 오류를 던진다', async () => {
    const { api, calls } = fakeApi('attach')
    await expect(withViewportEmulation(api, 7, viewportForWidth(375), async () => 'x', 0)).rejects.toThrow('already attached')
    expect(calls).toEqual(['attach'])
  })

  it('탭 id 와 폭을 명령에 그대로 담는다', async () => {
    const seen: Array<{ tabId: number; params: unknown }> = []
    const api: DebuggerApi = {
      attach: async (): Promise<void> => undefined,
      sendCommand: async (target, method, params): Promise<unknown> => {
        if (method === 'Emulation.setDeviceMetricsOverride') seen.push({ tabId: target.tabId, params })
        return undefined
      },
      detach: async (): Promise<void> => undefined
    }
    await withViewportEmulation(api, 42, viewportForWidth(390), async () => undefined, 0)
    expect(seen).toEqual([{ tabId: 42, params: { width: 390, height: 812, deviceScaleFactor: 0, mobile: false } }])
  })
})

describe('viewportForWidth', () => {
  it('범위 안의 정수만 받아들인다', () => {
    expect(viewportForWidth(375)).toEqual({ width: 375, height: 812 })
    expect(() => viewportForWidth(MIN_EMULATED_WIDTH - 1)).toThrow('정수')
    expect(() => viewportForWidth(MAX_EMULATED_WIDTH + 1)).toThrow('정수')
    expect(() => viewportForWidth(375.5)).toThrow('정수')
    expect(() => viewportForWidth(Number.NaN)).toThrow('정수')
  })
})
