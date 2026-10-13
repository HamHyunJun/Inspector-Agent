// 확장 빌드: popup 번들 + 정적 파일 + core 의 탐지기 IIFE 번들을 dist 로 모은다
import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const require = createRequire(import.meta.url)

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(join(root, 'public'), dist, { recursive: true })
await cp(require.resolve('@inspector-agent/core/detector.global.js'), join(dist, 'detector.global.js'))
await build({
  entryPoints: [join(root, 'src/popup.ts')],
  outfile: join(dist, 'popup.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome120'
})
console.log('확장 빌드 완료: packages/extension/dist (chrome://extensions 에서 압축해제된 확장으로 로드)')
