import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import type { BrowserContext, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * 실제 Chromium 에 빌드된 확장을 로드해 popup 스캔 → 대시보드 전송까지 검사한다.
 * 대시보드는 요청을 기록하는 가짜 서버로 대신한다(전송 내용, Origin, 사전 점검(OPTIONS) 여부를 확인하기 위해).
 * 확장 ID 는 테스트마다 만든 임시 키를 manifest 에 넣어 계산한다. 배포용 manifest 는 바꾸지 않는다.
 */

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')

interface Recorded {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: string
}

const FIXTURE_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>확장 E2E 대상 페이지</title>
    <style>
      body { margin: 0; padding: 16px; font-family: sans-serif; }
      .card { padding: 8px; background: #eee; }
      .wide-box { width: 420px; height: 40px; background: #8250df; }
    </style>
  </head>
  <body>
    <main>
      <section class="card"><div class="wide-box">고정 너비 420px (375px 에서만 넘침)</div></section>
    </main>
  </body>
</html>`

const listen = (server: Server): Promise<string> =>
  new Promise((resolve): void => {
    server.listen(0, '127.0.0.1', (): void => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    })
  })

/** Chrome 확장 ID: 공개 키(DER)의 SHA-256 앞 16바이트를 16진수로 쓰고 0-f 를 a-p 로 바꾼 것 */
const extensionIdFor = (der: Buffer): string =>
  Array.from(createHash('sha256').update(der).digest().subarray(0, 16))
    .map((byte): string => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 15)))
    .join('')

let context: BrowserContext
let extensionId = ''
let fixtureServer: Server
let dashboardServer: Server
let fixtureUrl = ''
let dashboardUrl = ''
let workDir = ''
const received: Recorded[] = []
let failDashboard = false

const scanFromPopup = async (options: { emulateWidth?: number }): Promise<{ status: string; page: Page }> => {
  const page = await context.newPage()
  await page.goto(`${fixtureUrl}/`)
  // 팝업을 탭으로 열면 활성 탭이 팝업 자신이므로, 대상 탭 id 를 찾아 popup.html?tabId= 로 지정한다
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const tabId = await popup.evaluate(async (url): Promise<number | undefined> => (await chrome.tabs.query({ url: `${url}/*` }))[0]?.id, fixtureUrl)
  expect(tabId, '대상 탭을 찾지 못했습니다').toBeGreaterThan(0)
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`)

  await popup.fill('#dashboard-url', dashboardUrl)
  if (options.emulateWidth !== undefined) {
    await popup.check('#emulate')
    await popup.fill('#emulate-width', String(options.emulateWidth))
  }
  await popup.click('button[type="submit"]')
  await popup.waitForFunction((): boolean => /대시보드로 보냈습니다|실패/.test(document.querySelector('#status')?.textContent ?? ''))
  const status = (await popup.locator('#status').textContent()) ?? ''
  return { status, page }
}

const lastScan = (): { viewportWidth: number; defects: Array<{ kind: string; severity: string; node: { selector: string }; suggestions: Array<{ hint: string }> }> } => {
  const request = received.filter((item): boolean => item.path === '/api/scans').at(-1)
  expect(request, '대시보드가 /api/scans 요청을 받지 못했습니다').toBeDefined()
  const result = (JSON.parse(request?.body ?? '{}') as { results: Array<{ viewport: { width: number }; defects: never[] }> }).results[0]
  return { viewportWidth: result?.viewport.width ?? 0, defects: (result?.defects ?? []) as never }
}

beforeAll(async (): Promise<void> => {
  // 소스가 바뀌어도 항상 현재 코드를 검사하도록 확장을 다시 빌드한다
  execFileSync(process.execPath, [join(packageDir, 'scripts/build.mjs')], { cwd: packageDir, stdio: 'ignore' })

  workDir = await mkdtemp(join(tmpdir(), 'ia-extension-e2e-'))
  const extensionDir = join(workDir, 'extension')
  await cp(join(packageDir, 'dist'), extensionDir, { recursive: true })
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const manifestPath = join(extensionDir, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
  await writeFile(manifestPath, JSON.stringify({ ...manifest, key: der.toString('base64') }))
  extensionId = extensionIdFor(der)

  fixtureServer = createServer((_request, response): void => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(FIXTURE_HTML)
  })
  dashboardServer = createServer((request, response): void => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer): void => {
      chunks.push(chunk)
    })
    request.on('end', (): void => {
      received.push({ method: request.method ?? '', path: request.url ?? '', headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
      response.writeHead(failDashboard ? 500 : 200, { 'content-type': 'application/json' }).end('{"received":1,"created":1,"updated":0,"resolved":0}')
    })
  })
  fixtureUrl = await listen(fixtureServer)
  dashboardUrl = await listen(dashboardServer)

  // 확장은 새 headless(channel: chromium)에서만 로드된다. headless shell 은 확장을 지원하지 않는다
  context = await chromium.launchPersistentContext(join(workDir, 'profile'), {
    ...(process.env.INSPECTOR_CHROMIUM_PATH ? { executablePath: process.env.INSPECTOR_CHROMIUM_PATH } : { channel: 'chromium' as const }),
    headless: true,
    viewport: null,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--window-size=1280,800']
  })
})

afterAll(async (): Promise<void> => {
  await context?.close()
  await Promise.all([fixtureServer, dashboardServer].map((server): Promise<void> => new Promise((done): void => void server?.close((): void => done()))))
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

describe('Chrome 확장 E2E (실제 Chromium)', () => {
  it('확장이 로드되어 popup 이 열린다', async () => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    expect(await popup.locator('h1').textContent()).toBe('Inspector-Agent')
    expect(await popup.locator('#emulate').isChecked()).toBe(false)
    await popup.close()
  })

  it('데스크톱 폭으로 스캔하면 결함 없이 대시보드로 전송되고, 확장 Origin 으로 사전 점검 없이 요청한다', async () => {
    received.length = 0
    const { status, page } = await scanFromPopup({})
    expect(status).toMatch(/대시보드로 보냈습니다/)
    expect(status).not.toContain('에뮬레이션')

    const scan = lastScan()
    expect(scan.viewportWidth).toBeGreaterThan(700)
    expect(scan.defects).toEqual([])

    const request = received.find((item): boolean => item.path === '/api/scans')
    expect(request?.method).toBe('POST')
    // 대시보드의 요청 검사가 허용하는 Origin 이고, CORS 사전 점검(OPTIONS) 없이 보낸다 = 대시보드가 CORS 를 열 필요가 없다
    expect(request?.headers.origin).toBe(`chrome-extension://${extensionId}`)
    expect(received.map((item): string => item.method)).not.toContain('OPTIONS')
    await page.close()
  })

  it('375px 에뮬레이션 옵션을 켜면 375px 에서 결함을 탐지해 전송하고, 끝나면 뷰포트를 원복한다', async () => {
    received.length = 0
    const { status, page } = await scanFromPopup({ emulateWidth: 375 })
    expect(status).toMatch(/375px 뷰포트\(에뮬레이션\)에서 결함 1건을 대시보드로 보냈습니다/)

    const scan = lastScan()
    expect(scan.viewportWidth).toBe(375)
    expect(scan.defects).toHaveLength(1)
    expect(scan.defects[0]).toMatchObject({ kind: 'overflow-x', severity: 'high' })
    expect(scan.defects[0]?.node.selector).toContain('wide-box')
    expect(scan.defects[0]?.suggestions[0]?.hint).toBe('fixed-width')

    // 에뮬레이션이 남아 있으면 이후 사용자가 보는 탭이 계속 375px 로 보인다
    expect(await page.evaluate((): number => window.innerWidth)).toBeGreaterThan(700)
    await page.close()
  })

  it('대시보드가 실패해도 오류를 보여 주고 에뮬레이션을 원복한다', async () => {
    received.length = 0
    failDashboard = true
    try {
      const { status, page } = await scanFromPopup({ emulateWidth: 375 })
      expect(status).toContain('실패: 대시보드 응답 500')
      expect(await page.evaluate((): number => window.innerWidth)).toBeGreaterThan(700)
      await page.close()
    } finally {
      failDashboard = false
    }
  })
})
