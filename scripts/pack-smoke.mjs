// 배포될 tarball 을 실제로 설치해 보는 스모크 테스트. 저장소 안의 workspace 링크 때문에 가려지는 문제
// (exports 누락, files 누락, workspace:* 미치환, bin 실행 권한, 의존성 누락)를 npm 에 올리기 전에 잡는다.
//   node scripts/pack-smoke.mjs [--keep]      (먼저 pnpm build 가 필요하다. Chromium 이 있어야 CLI 스캔을 확인한다)
// 하는 일: pnpm pack → tarball 내용 검사 → 임시 Vite+Vue 프로젝트에 설치 → 개발 서버에서 data-ia-src 주입 확인
//          → inspector-scan 으로 결함 탐지·종료 코드 확인 → MCP 서버가 도구 목록을 돌려주는지 확인 → core 가져오기 확인
// npm publish 는 실행하지 않는다.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLISH_DIRS } from './release-check.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const tmp = mkdtempSync(join(tmpdir(), 'ia-pack-smoke-'))
const packs = join(tmp, 'packs')
const app = join(tmp, 'app')
let vite

const ok = (message) => console.log(`✓ ${message}`)
const fail = (message) => {
  throw new Error(message)
}
const assert = (condition, message) => {
  if (!condition) fail(message)
}
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })

const waitFor = async (check, what, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  fail(`${what} 을(를) ${timeoutMs / 1000}초 안에 확인하지 못했습니다${lastError ? `: ${lastError.message}` : ''}`)
}

/** MCP 서버를 stdio 로 띄워 initialize → tools/list 응답을 받는다 */
const listMcpTools = (binPath, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath], { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('MCP 서버가 15초 안에 응답하지 않았습니다'))
    }, 15_000)
    let buffer = ''
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      for (const line of buffer.split('\n').slice(0, -1)) {
        const message = JSON.parse(line)
        if (message.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
        }
        if (message.id === 2) {
          clearTimeout(timer)
          child.kill()
          resolve(message.result.tools.map((tool) => tool.name))
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
    })
    child.on('error', reject)
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'pack-smoke', version: '0.0.0' } } })
  })

const main = async () => {
  // 1) pack
  mkdirSync(packs, { recursive: true })
  for (const dir of PUBLISH_DIRS) run('pnpm', ['pack', '--pack-destination', packs], { cwd: join(root, 'packages', dir) })
  const tarballs = Object.fromEntries(
    readdirSync(packs).map((file) => {
      const manifest = JSON.parse(run('tar', ['-xzOf', join(packs, file), 'package/package.json']))
      return [manifest.name, { path: join(packs, file), manifest, entries: run('tar', ['-tzf', join(packs, file)]).split('\n').filter(Boolean) }]
    })
  )
  assert(Object.keys(tarballs).length === PUBLISH_DIRS.length, `tarball 이 ${PUBLISH_DIRS.length}개여야 합니다: ${Object.keys(tarballs).join(', ')}`)
  ok(`pack 완료: ${Object.values(tarballs).map(({ manifest }) => `${manifest.name}@${manifest.version}`).join(', ')}`)

  // 2) tarball 내용: 산출물, 문서, 라이선스는 있고 소스, 테스트, 설정, 도구 상태 파일은 없어야 한다
  for (const [name, { manifest, entries }] of Object.entries(tarballs)) {
    for (const required of ['package/package.json', 'package/README.md', 'package/LICENSE']) assert(entries.includes(required), `${name}: ${required} 가 tarball 에 없습니다`)
    assert(entries.some((entry) => entry.startsWith('package/dist/')), `${name}: dist 가 tarball 에 없습니다`)
    const stray = entries.filter((entry) => /^package\/(src|test|tests|scripts)\/|tsconfig|\.omc|\.test\.|node_modules/.test(entry))
    assert(stray.length === 0, `${name}: 배포하면 안 되는 파일이 들어 있습니다: ${stray.join(', ')}`)
    const workspaceRanges = Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies }).filter(([, range]) => String(range).startsWith('workspace:'))
    assert(workspaceRanges.length === 0, `${name}: workspace: 의존성이 치환되지 않았습니다 (${workspaceRanges.map(([dep]) => dep).join(', ')})`)
  }
  const coreRange = tarballs['@inspector-agent/verifier'].manifest.dependencies['@inspector-agent/core']
  assert(coreRange === `^${tarballs['@inspector-agent/core'].manifest.version}`, `verifier 의 core 의존 범위가 ^버전이 아닙니다: ${coreRange}`)
  ok(`tarball 내용 검사 통과 (workspace:^ → ${coreRange} 로 치환됨, 소스/테스트 미포함)`)

  // 3) 임시 Vite + Vue 프로젝트에 tarball 만으로 설치 (레지스트리에 아직 없는 core 는 overrides 로 같은 tarball 을 가리킨다)
  const playground = JSON.parse(readFileSync(join(root, 'apps/playground/package.json'), 'utf8'))
  const file = (name) => `file:${tarballs[name].path}`
  mkdirSync(join(app, 'src'), { recursive: true })
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify(
      {
        name: 'pack-smoke-app',
        private: true,
        type: 'module',
        dependencies: { vue: playground.dependencies.vue },
        devDependencies: {
          vite: playground.devDependencies.vite,
          '@vitejs/plugin-vue': playground.devDependencies['@vitejs/plugin-vue'],
          '@inspector-agent/vite-plugin': file('@inspector-agent/vite-plugin'),
          '@inspector-agent/verifier': file('@inspector-agent/verifier'),
          '@inspector-agent/mcp-server': file('@inspector-agent/mcp-server'),
          '@inspector-agent/core': file('@inspector-agent/core')
        },
        pnpm: { overrides: { '@inspector-agent/core': file('@inspector-agent/core') }, onlyBuiltDependencies: ['esbuild'] }
      },
      null,
      2
    )
  )
  writeFileSync(join(app, 'index.html'), '<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>smoke</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>')
  writeFileSync(join(app, 'src/main.js'), "import { createApp } from 'vue'\nimport App from './App.vue'\ncreateApp(App).mount('#app')\n")
  writeFileSync(join(app, 'src/App.vue'), '<template>\n  <main class="page">\n    <section class="card">\n      <div class="wide-box">고정 너비 420px (375px 에서만 넘침)</div>\n    </section>\n  </main>\n</template>\n\n<style>\nbody { margin: 0; padding: 16px; }\n.card { padding: 8px; }\n.wide-box { width: 420px; height: 40px; background: #8250df; }\n</style>\n')
  writeFileSync(join(app, 'vite.config.js'), "import vue from '@vitejs/plugin-vue'\nimport inspectorAgent from '@inspector-agent/vite-plugin'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [inspectorAgent(), vue()] })\n")
  run('pnpm', ['install', '--prefer-offline', '--ignore-workspace'], { cwd: app })
  ok('임시 Vite+Vue 프로젝트에 tarball 4개 설치 완료')

  // 4) vite-plugin: 개발 서버에서 data-ia-src 가 주입되는지
  const port = await freePort()
  vite = spawn(process.execPath, [join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', 'localhost'], { cwd: app, stdio: 'ignore' })
  const base = `http://localhost:${port}`
  const transformed = await waitFor(async () => {
    const response = await fetch(`${base}/src/App.vue`)
    return response.ok ? response.text() : undefined
  }, 'Vite 개발 서버')
  assert(/"data-ia-src":\s*"src\/App\.vue:\d+:\d+"/.test(transformed), 'vite-plugin 이 App.vue 에 data-ia-src(src/App.vue:라인:컬럼)를 주입하지 못했습니다')
  ok('@inspector-agent/vite-plugin: 개발 서버에서 data-ia-src 주입 확인')

  // 5) verifier CLI: 375px 에서는 결함을 잡고(종료 코드 1), 1280px 에서는 통과(0)
  const scanBin = join(app, 'node_modules/.bin/inspector-scan')
  let failing
  try {
    run(scanBin, [base, '--viewports', '375', '--fail-on', 'high'], { cwd: app })
    fail('375px 스캔이 종료 코드 0 으로 끝났습니다(결함을 못 잡음)')
  } catch (error) {
    failing = error
  }
  assert(failing.status === 1, `375px 스캔 종료 코드가 1 이어야 합니다 (받은 값 ${failing.status}). 출력: ${failing.stderr ?? failing.message}`)
  assert(String(failing.stdout).includes('src/App.vue'), `스캔 결과에 소스 위치(src/App.vue)가 없습니다: ${failing.stdout}`)
  run(scanBin, [base, '--viewports', '1280', '--fail-on', 'high'], { cwd: app })
  ok('@inspector-agent/verifier: inspector-scan 이 375px 에서 결함(src/App.vue)을 잡고 1280px 에서는 통과')

  // 6) mcp-server: bin 이 실행되고 도구 목록을 돌려준다
  const tools = await listMcpTools(join(app, 'node_modules/@inspector-agent/mcp-server/dist/index.js'), app)
  for (const name of ['scan_page', 'list_defects', 'get_defect_context', 'propose_patch', 'get_patch_status']) assert(tools.includes(name), `MCP 도구 ${name} 가 없습니다: ${tools.join(', ')}`)
  ok(`@inspector-agent/mcp-server: 도구 ${tools.length}개 노출 (${tools.join(', ')})`)
  // 슬래시 명령 원본이 tarball 에 들어 있어 install-commands 가 /ia, /insp 파일을 만든다
  run(process.execPath, [join(app, 'node_modules/@inspector-agent/mcp-server/dist/index.js'), 'install-commands', '--project'], { cwd: app })
  for (const name of ['ia', 'insp']) assert(readFileSync(join(app, '.claude/commands', `${name}.md`), 'utf8').includes('scan_page'), `install-commands 가 ${name}.md 를 만들지 못했습니다`)
  ok('@inspector-agent/mcp-server: install-commands 가 /ia, /insp 명령 파일을 설치')

  // 7) core: 설치된 패키지에서 가져오기, 탐지기 번들 경로(exports) 확인
  const coreCheck = run(
    process.execPath,
    ['--input-type=module', '-e', "import { createRequire } from 'node:module'; import { existsSync } from 'node:fs'; const core = await import('@inspector-agent/core'); const detector = createRequire(import.meta.url).resolve('@inspector-agent/core/detector.global.js'); console.log(JSON.stringify({ parse: typeof core.parseScenario, group: typeof core.groupDefects, detector: existsSync(detector) }))"],
    { cwd: app }
  )
  const parsed = JSON.parse(coreCheck)
  assert(parsed.parse === 'function' && parsed.group === 'function' && parsed.detector === true, `core 가져오기 실패: ${coreCheck}`)
  ok('@inspector-agent/core: ESM 가져오기와 detector.global.js(exports) 확인')

  console.log('\n스모크 테스트 통과: 이 tarball 로 설치해 동작합니다.')
}

main()
  .catch((error) => {
    console.error(`\n✗ 스모크 테스트 실패: ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => {
    vite?.kill()
    if (keep) console.log(`(임시 폴더 유지: ${tmp})`)
    else rmSync(tmp, { recursive: true, force: true })
  })
