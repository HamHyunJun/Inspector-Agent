import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { injectSourceAttributes } from './inject'

export interface InspectorAgentPluginOptions {
  /** 주입할 속성 이름. 기본 data-ia-src (탐지기 기본값과 동일해야 한다) */
  attribute?: string
  /** 프로덕션 빌드에도 주입할지 여부. 기본 false (개발 서버에서만 동작) */
  includeBuild?: boolean
  /** 주입 대상에서 제외할 경로 조건 */
  exclude?: (id: string) => boolean
}

/**
 * data-ia-src 경로의 기준 폴더. Vite root 에서 위로 올라가며 package.json 이 있는 첫 폴더를 쓴다.
 * Nuxt 4 는 Vite root 를 srcDir(app/) 로 잡아 `app/` 접두어가 빠지는데, 대시보드는 프로젝트 루트 기준으로 파일을 찾는다.
 */
export const resolveProjectRoot = (viteRoot: string): string => {
  for (let dir = viteRoot; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir
    if (dirname(dir) === dir) return viteRoot
  }
}

/**
 * DOM 노드 → .vue 파일:라인:컬럼 매핑을 만드는 Vite 플러그인.
 * @vitejs/plugin-vue 보다 먼저(enforce: 'pre') 원본 SFC를 변환해야 정확한 라인이 남는다.
 */
const inspectorAgent = (options: InspectorAgentPluginOptions = {}): Plugin => {
  const attribute = options.attribute ?? 'data-ia-src'
  let root = process.cwd()

  return {
    name: 'inspector-agent:source-map',
    enforce: 'pre',
    apply: options.includeBuild ? undefined : 'serve',
    configResolved: (config): void => {
      root = resolveProjectRoot(config.root)
    },
    transform: (code, id) => {
      const [filepath = ''] = id.split('?')
      if (!filepath.endsWith('.vue') || id.includes('?vue&') || filepath.includes('/node_modules/')) return undefined
      if (options.exclude?.(filepath)) return undefined
      const result = injectSourceAttributes(code, relative(root, filepath), attribute)
      return result ? { code: result.code, map: result.map } : undefined
    }
  }
}

export default inspectorAgent
export { inspectorAgent, injectSourceAttributes }
