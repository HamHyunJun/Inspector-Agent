import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanPage } from '../src'

/**
 * 실제 Chromium 으로 자동 탐색을 검사한다.
 * - 클릭해야 열리는 팝오버가 화면 밖으로 나가는 경우
 * - 눌러서는 안 되는 버튼(삭제, 제출)은 누르지 않는 것
 * - 탐색을 끄거나 시나리오를 주면 탐색하지 않는 것
 */

const HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>탐색 대상</title>
<style>
  body { margin: 0; padding: 16px; font-family: sans-serif; }
  nav { display: flex; justify-content: flex-end; gap: 8px; }
  .wrap { position: relative; }
  .pop { position: absolute; top: 40px; left: 0; width: 360px; padding: 8px; background: #eee; }
  .hint { position: relative; display: inline-block; margin-top: 24px; }
  .hint .tip { position: absolute; top: 28px; left: 0; width: 100px; opacity: 0; }
  .hint:hover .tip { opacity: 1; }
</style></head>
<body>
  <nav>
    <span class="wrap">
      <button type="button" id="open" aria-expanded="false" aria-controls="pop">설명 열기</button>
      <div id="pop" class="pop" hidden>화면 오른쪽 끝에서 왼쪽 방향이 아닌 오른쪽으로 삐져나가는 팝오버</div>
    </span>
  </nav>
  <span class="hint"><span tabindex="0">도움말</span><span class="tip">툴팁</span></span>
  <button type="button" id="del">삭제</button>
  <form><button type="submit" id="send">보내기</button></form>
  <p id="log"></p>
  <script>
    const open = document.getElementById('open')
    open.addEventListener('click', () => {
      const pop = document.getElementById('pop')
      pop.hidden = !pop.hidden
      open.setAttribute('aria-expanded', String(!pop.hidden))
    })
    for (const id of ['del', 'send']) document.getElementById(id).addEventListener('click', () => { document.getElementById('log').textContent += id })
  </script>
</body></html>`

let server: Server
let url = ''

beforeAll(async (): Promise<void> => {
  server = createServer((_request, response): void => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(HTML)
  })
  await new Promise<void>((resolve): void => void server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})

afterAll((): void => {
  server.close()
})

describe('자동 탐색', () => {
  it('시나리오 없이 팝오버 트리거를 눌러 보고, 열렸을 때만 생기는 화면 이탈을 시나리오와 함께 돌려준다', async (): Promise<void> => {
    const results = await scanPage(url, [{ width: 375, height: 700 }])
    const [base, ...explored] = results
    expect(base?.scenarioKey).toBeUndefined()
    expect(base?.defects).toEqual([])

    const opened = explored.find((result): boolean => result.scenario?.name?.includes('설명 열기') === true && result.scenario.steps?.[0]?.action === 'click')
    expect(opened?.defects).toHaveLength(1)
    expect(opened?.defects[0]).toMatchObject({ kind: 'overflow-x', metrics: { mode: 'viewport' }, scenarioKey: opened?.scenarioKey })
    // 같은 상태를 다시 만들 수 있는 시나리오여야 패치 후 재측정이 된다
    expect(opened?.scenario?.steps?.map((step): string => step.action)).toEqual(['click', 'wait'])
  }, 60_000)

  it('위험해 보이는 버튼과 제출 버튼은 누르지 않는다', async (): Promise<void> => {
    const results = await scanPage(url, [{ width: 375, height: 700 }])
    const names = results.map((result): string => result.scenario?.name ?? '')
    expect(names.some((name): boolean => name.includes('삭제') || name.includes('보내기'))).toBe(false)
  }, 60_000)

  it('explore: false 이거나 시나리오를 주면 탐색하지 않는다', async (): Promise<void> => {
    const off = await scanPage(url, [{ width: 375, height: 700 }], { explore: false })
    expect(off).toHaveLength(1)
    const withScenario = await scanPage(url, [{ width: 375, height: 700 }], { scenario: { steps: [{ action: 'wait', ms: 0 }] } })
    expect(withScenario).toHaveLength(1)
  }, 60_000)

  it('깊이 20단계 중첩 버튼의 선택자는 300자 이하이고 유일하다', async (): Promise<void> => {
    const nest = (inner: string): string => `${'<div>'.repeat(20)}${inner}${'</div>'.repeat(20)}`
    const pages = [
      nest('<button type="button" id="work-toggle-company-0" aria-expanded="false">숫자 id</button>'),
      nest('<button type="button" aria-expanded="false">id 없음</button>')
    ]
    for (const body of pages) {
      const deep = createServer((_request, response): void => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>깊은 중첩</title></head><body>${body}</body></html>`)
      })
      await new Promise<void>((resolve): void => void deep.listen(0, '127.0.0.1', resolve))
      try {
        const results = await scanPage(`http://127.0.0.1:${(deep.address() as AddressInfo).port}/`, [{ width: 375, height: 700 }])
        const selector = results.find((result): boolean => result.scenario?.steps?.[0]?.action === 'click')?.scenario?.steps?.[0]?.selector
        expect(selector).toBeDefined()
        expect(selector?.length).toBeLessThanOrEqual(300)
      } finally {
        deep.close()
      }
    }
  }, 60_000)
})
