import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { inspectorAgent, resolveProjectRoot } from '../src'

const template = '<template>\n  <section class="a">\n    <p>x</p>\n  </section>\n</template>\n'

/** package.json 이 있는 프로젝트 루트와 그 아래 app/ 을 가진 임시 Nuxt 4 형태 폴더 */
const createNuxtLike = (): { rootDir: string; srcDir: string } => {
  const rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'ia-nuxt-')))
  const srcDir = join(rootDir, 'app')
  mkdirSync(join(srcDir, 'pages'), { recursive: true })
  mkdirSync(join(srcDir, 'layouts'), { recursive: true })
  writeFileSync(join(rootDir, 'package.json'), '{}')
  return { rootDir, srcDir }
}

const transformWith = (viteRoot: string, file: string, code = template): string | undefined => {
  const plugin = inspectorAgent()
  ;(plugin.configResolved as (config: ResolvedConfig) => void)({ root: viteRoot } as ResolvedConfig)
  const result = (plugin.transform as (code: string, id: string) => { code: string } | undefined)(code, file)
  return result?.code
}

describe('resolveProjectRoot', () => {
  it('Vite root 에 package.json 이 있으면 그대로 쓴다', () => {
    const { rootDir } = createNuxtLike()
    expect(resolveProjectRoot(rootDir)).toBe(rootDir)
  })

  it('Nuxt 4 처럼 root 가 app/ 이면 package.json 이 있는 상위 폴더를 쓴다', () => {
    const { rootDir, srcDir } = createNuxtLike()
    expect(resolveProjectRoot(srcDir)).toBe(rootDir)
  })

  it('package.json 을 못 찾으면 Vite root 를 그대로 쓴다', () => {
    expect(resolveProjectRoot('/')).toBe('/')
  })
})

describe('inspectorAgent (Nuxt 4 app/ 구조)', () => {
  it('pages, layouts, 중첩 components 의 경로가 프로젝트 루트 기준(app/ 포함)이다', () => {
    const { srcDir } = createNuxtLike()
    expect(transformWith(srcDir, join(srcDir, 'pages/index.vue'))).toContain('data-ia-src="app/pages/index.vue:2:3"')
    expect(transformWith(srcDir, join(srcDir, 'layouts/default.vue'))).toContain('data-ia-src="app/layouts/default.vue:3:5"')
    expect(transformWith(srcDir, join(srcDir, 'components/card/Item.vue'))).toContain('app/components/card/Item.vue:2:3')
  })

  it('Vite 쿼리가 붙은 하위 요청과 node_modules 는 변환하지 않는다', () => {
    const { srcDir } = createNuxtLike()
    expect(transformWith(srcDir, `${join(srcDir, 'pages/index.vue')}?vue&type=style&index=0`)).toBeUndefined()
    expect(transformWith(srcDir, join(srcDir, 'node_modules/x/Y.vue'))).toBeUndefined()
  })
})
