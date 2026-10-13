// 개발 서버(기본 :5180)에서 각 .vue 모듈을 받아 data-ia-src 가 프로젝트 루트 기준으로 정확한 파일:라인:컬럼 인지 검증한다
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] ?? 'http://localhost:5180'
const modules = ['layouts/default.vue', 'pages/index.vue', 'components/card/Item.vue']
let failures = 0

for (const module of modules) {
  const code = await (await fetch(`${base}/_nuxt/${module}`)).text()
  const values = [...code.matchAll(/"data-ia-src": "([^"]+)"/g)].map((match) => match[1])
  if (values.length === 0) { console.log(`✗ ${module}: data-ia-src 없음`); failures++; continue }
  for (const value of values) {
    const [file, line, column] = value.split(/:(?=\d+:\d+$)/).flatMap((part, index) => (index === 0 ? [part] : part.split(':')))
    const path = join(root, file)
    const source = existsSync(path) ? readFileSync(path, 'utf8').split('\n')[Number(line) - 1] ?? '' : ''
    const ok = file === `app/${module}` && source.slice(Number(column) - 1).startsWith('<')
    if (!ok) failures++
    console.log(`${ok ? '✓' : '✗'} ${value}  ${source.trim()}`)
  }
}
process.exit(failures === 0 ? 0 : 1)
