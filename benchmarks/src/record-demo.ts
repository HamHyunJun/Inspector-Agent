import { spawn } from 'node:child_process'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { preparePlayground } from './prepare'

/**
 * README 맨 위 데모 GIF 용 화면 녹화: 대시보드 스캔 → 결함 상세 → 패치 제안 → 적용 후 재측정(→ 0px).
 * playground 임시 복사본과 임시 데이터 폴더만 쓰므로 저장소 파일은 바뀌지 않는다.
 * 실행: pnpm demo  (결과: docs/assets/demo.webm. GIF 는 ffmpeg -i demo.webm -vf "fps=8,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" demo.gif)
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const output = join(repoRoot, 'docs/assets')
const APP_PORT = 5197
const DASHBOARD_PORT = 3200
const executablePath = process.env.INSPECTOR_CHROMIUM_PATH || undefined
const pause = (ms: number): Promise<void> => new Promise((done): void => void setTimeout(done, ms))

const waitForHttp = async (url: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // 아직 뜨는 중
    }
    await pause(500)
  }
  throw new Error(`${url} 이 ${timeoutMs}ms 안에 뜨지 않았습니다.`)
}

const main = async (): Promise<void> => {
  const workdir = await preparePlayground(join(repoRoot, 'apps/playground'))

  const app = await createServer({ root: workdir, configFile: join(workdir, 'vite.config.ts'), logLevel: 'error', server: { port: APP_PORT, strictPort: true } })
  await app.listen()
  const dashboard = spawn('pnpm', ['exec', 'nuxt', 'dev', '--port', String(DASHBOARD_PORT)], {
    cwd: join(repoRoot, 'apps/dashboard'),
    env: { ...process.env, NUXT_IGNORE_LOCK: '1', INSPECTOR_PROJECT_ROOT: workdir, INSPECTOR_DATA_DIR: join(workdir, '.inspector-data'), INSPECTOR_SETTLE_MS: '1200' },
    stdio: 'ignore'
  })
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    await waitForHttp(`http://localhost:${DASHBOARD_PORT}/`, 120_000)
    const videoDir = join(workdir, 'video')
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } })
    const page = await context.newPage()
    await page.goto(`http://localhost:${DASHBOARD_PORT}/`, { waitUntil: 'networkidle' })
    await pause(1200)

    // 1) 스캔: 375px 만 (영상 길이를 줄이려고)
    await page.fill('#scan-url', `http://localhost:${APP_PORT}`)
    await page.fill('#scan-viewports', '375')
    await pause(800)
    await page.click('button[type=submit]')
    await page.getByRole('status').waitFor({ timeout: 60_000 })
    await pause(2200)

    // 2) 결함 상세: ShareLink (공백 없는 긴 URL)
    await page.getByRole('link', { name: /ShareLink\.vue/ }).first().scrollIntoViewIfNeeded()
    await pause(1200)
    await page.getByRole('link', { name: /ShareLink\.vue/ }).first().click()
    await page.getByRole('heading', { name: '결정론적 진단' }).waitFor()
    await pause(2000)
    await page.getByRole('heading', { name: '소스 매핑' }).scrollIntoViewIfNeeded()
    await pause(2500)

    // 3) 규칙 기반 패치 제안 → 적용하고 검증
    await page.getByRole('button', { name: '이 규칙으로 패치 제안' }).first().scrollIntoViewIfNeeded()
    await pause(800)
    await page.getByRole('button', { name: '이 규칙으로 패치 제안' }).first().click()
    const apply = page.getByRole('button', { name: '적용하고 검증' })
    await apply.waitFor({ timeout: 30_000 })
    await apply.scrollIntoViewIfNeeded()
    await pause(2500)
    await apply.click()

    // 4) 재측정 결과: 전 251px → 후 0px
    await page.getByRole('heading', { name: '재측정 결과' }).waitFor({ timeout: 60_000 })
    await page.getByRole('heading', { name: '재측정 결과' }).scrollIntoViewIfNeeded()
    await pause(4000)

    await context.close()
    await mkdir(output, { recursive: true })
    const [video] = await readdir(videoDir)
    if (!video) throw new Error('녹화 파일이 없습니다.')
    await rename(join(videoDir, video), join(output, 'demo.webm'))
    console.log(`녹화 저장: ${join(output, 'demo.webm')}`)
  } finally {
    await browser.close()
    dashboard.kill('SIGTERM')
    await app.close()
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error: unknown): void => {
  console.error(error)
  process.exitCode = 1
})
