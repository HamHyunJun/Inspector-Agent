import { spawn } from 'node:child_process'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { preparePlayground } from './prepare'

/**
 * README 맨 위 데모 GIF 용 녹화: 터미널에서 실제 명령 두 개를 실행한 **진짜 출력**을 캡처해 터미널 화면으로 재생한다.
 *   1) inspector-scan   : 375px 스캔 (결함과 소스 위치)
 *   2) inspector-agent fix --yes : 규칙 기반 패치 제안 → 적용 → 재측정 → 통과, 실패하면 자동 롤백
 * playground-react 임시 복사본만 쓰므로 저장소 파일은 바뀌지 않는다. 출력 텍스트는 가공하지 않고 주소(포트)만 문서의 예시와 맞춘다.
 * 실행: pnpm --filter @inspector-agent/benchmarks demo  (결과: docs/assets/demo.webm, demo.gif. GIF 변환에는 ffmpeg 가 필요하다)
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const output = join(repoRoot, 'docs/assets')
const APP_PORT = 5197
const DISPLAY_URL = 'http://localhost:5173'
const executablePath = process.env.INSPECTOR_CHROMIUM_PATH || undefined

const capture = (script: string, args: string[], cwd: string): Promise<string> =>
  new Promise((done, fail): void => {
    const child = spawn(process.execPath, [join(repoRoot, script), ...args], { cwd, env: { ...process.env, INSPECTOR_SETTLE_MS: '1200', FORCE_COLOR: '0' } })
    let text = ''
    child.stdout.on('data', (chunk: Buffer): void => void (text += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer): void => void (text += chunk.toString('utf8')))
    child.on('error', fail)
    // 결함이 있으면 종료 코드가 0 이 아니어도 출력은 그대로 쓴다
    child.on('close', (): void => done(text.replaceAll(`http://localhost:${APP_PORT}`, DISPLAY_URL).trimEnd()))
  })

const terminalPage = (steps: Array<{ command: string; output: string }>): string => `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #0b0d12; display: grid; place-items: center; height: 100vh; font-family: ui-monospace, Menlo, monospace; }
  .win { width: 1180px; height: 660px; background: #11141b; border: 1px solid #2a2f3a; border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: 36px 1fr; }
  .bar { display: flex; gap: 8px; align-items: center; padding: 0 14px; background: #1a1e27; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a4150; }
  .bar span { margin-left: 8px; color: #8b93a5; font-size: 13px; }
  #term { padding: 16px 20px; overflow: hidden; color: #d7dce6; font-size: 15px; line-height: 21px; white-space: pre-wrap; word-break: break-all; }
  .cmd { color: #7ee787; } .add { color: #7ee787; } .del { color: #ff7b72; } .ok { color: #7ee787; } .bad { color: #ffa657; } .hi { color: #ff7b72; } .dim { color: #8b93a5; }
</style>
<div class="win"><div class="bar"><i></i><i></i><i></i><span>my-app — zsh</span></div><div id="term"></div></div>
<script>
  const steps = ${JSON.stringify(steps)}
  const term = document.getElementById('term')
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
  const classify = (line) => /^\\+(?!\\+\\+)/.test(line) ? 'add' : /^-(?!--)/.test(line) ? 'del' : /통과/.test(line) ? 'ok' : /실패|롤백|불가/.test(line) ? 'bad' : /\\[high\\]/.test(line) ? 'hi' : /^(---|\\+\\+\\+|@@|=+$)/.test(line) ? 'dim' : ''
  const add = (text, cls) => { const row = document.createElement('div'); row.className = cls; row.textContent = text; term.appendChild(row); term.scrollTop = term.scrollHeight; return row }
  window.__done = (async () => {
    await sleep(800)
    for (const step of steps) {
      const row = add('$ ', 'cmd')
      for (const char of step.command) { row.textContent += char; await sleep(32) }
      await sleep(500)
      for (const line of step.output.split('\\n')) { add(line, classify(line)); await sleep(line.trim() === '' ? 20 : 70) }
      await sleep(1600)
    }
    await sleep(3000)
    return true
  })()
</script>`

const main = async (): Promise<void> => {
  const workdir = await preparePlayground(join(repoRoot, 'apps/playground-react'))
  const app = await createServer({ root: workdir, configFile: join(workdir, 'vite.config.ts'), logLevel: 'error', server: { port: APP_PORT, strictPort: true } })
  await app.listen()
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const url = `http://localhost:${APP_PORT}`
    const scan = await capture('packages/verifier/dist/cli.js', [url, '--viewports', '375'], workdir)
    const fix = await capture('packages/engine/dist/cli.js', ['fix', url, '--viewports', '375', '--yes'], workdir)
    const steps = [
      { command: `npx inspector-scan ${DISPLAY_URL} --viewports 375`, output: scan },
      { command: `npx -y @inspector-agent/engine fix ${DISPLAY_URL} --viewports 375 --yes`, output: fix }
    ]

    const videoDir = join(workdir, 'video')
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } })
    const page = await context.newPage()
    await page.setContent(terminalPage(steps))
    await page.evaluate((): Promise<boolean> => (window as unknown as { __done: Promise<boolean> }).__done)
    await context.close()

    await mkdir(output, { recursive: true })
    const [video] = await readdir(videoDir)
    if (!video) throw new Error('녹화 파일이 없습니다.')
    await rename(join(videoDir, video), join(output, 'demo.webm'))
    await new Promise<void>((done, fail): void => {
      const ffmpeg = spawn('ffmpeg', ['-y', '-i', join(output, 'demo.webm'), '-vf', 'fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', join(output, 'demo.gif')], { stdio: 'ignore' })
      ffmpeg.on('error', fail)
      ffmpeg.on('close', (code): void => (code === 0 ? done() : fail(new Error(`ffmpeg 종료 코드 ${code}`))))
    })
    console.log(`저장: ${join(output, 'demo.gif')}`)
  } finally {
    await browser.close()
    await app.close()
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error: unknown): void => {
  console.error(error)
  process.exitCode = 1
})
