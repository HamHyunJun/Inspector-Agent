import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export interface EngineConfig {
  /** 패치를 반영할 프로젝트 루트. 이 밖의 경로는 수정하지 않는다 */
  projectRoot: string
  /** 결함·패치 저장소(store.json)와 백업 위치 */
  dataDir: string
  /** 파일 반영 후 HMR 이 끝나길 기다리는 시간(ms) */
  settleMs: number
  chromiumPath?: string
}

export const DEFAULT_SETTLE_MS = 800

/** 설정을 절대 경로로 정규화한다. 상대 경로는 base(기본: 현재 작업 폴더) 기준이다 */
export const resolveConfig = (input: Partial<EngineConfig> = {}, base: string = process.cwd()): EngineConfig => {
  const toAbsolute = (path: string): string => (isAbsolute(path) ? path : resolve(base, path))
  const projectRoot = toAbsolute(input.projectRoot ?? '.')
  return {
    projectRoot,
    dataDir: input.dataDir ? toAbsolute(input.dataDir) : resolve(projectRoot, '.inspector-agent'),
    settleMs: input.settleMs ?? DEFAULT_SETTLE_MS,
    chromiumPath: input.chromiumPath || undefined
  }
}

/** MCP 서버와 CLI 가 쓰는 환경 변수 해석. 프로젝트 루트는 기본이 현재 작업 폴더라 따로 설정할 것이 없다 */
export const configFromEnv = (env: NodeJS.ProcessEnv = process.env): EngineConfig =>
  resolveConfig({
    projectRoot: env.INSPECTOR_PROJECT_ROOT,
    dataDir: env.INSPECTOR_DATA_DIR,
    settleMs: env.INSPECTOR_SETTLE_MS ? Number(env.INSPECTOR_SETTLE_MS) : undefined,
    chromiumPath: env.INSPECTOR_CHROMIUM_PATH
  })

/**
 * 프로젝트 루트가 기본값(현재 폴더)일 때 엉뚱한 폴더(/, 홈 폴더)에서 시작된 경우를 알린다.
 * 일부 MCP 클라이언트는 서버를 프로젝트가 아닌 폴더에서 띄운다. package.json 이 없으면 문제로 본다.
 */
export const projectRootProblem = (config: EngineConfig): string | undefined =>
  existsSync(join(config.projectRoot, 'package.json'))
    ? undefined
    : `프로젝트 루트(${config.projectRoot})에 package.json 이 없습니다. MCP 클라이언트가 프로젝트 폴더에서 서버를 시작하지 않았을 수 있습니다. 환경 변수 INSPECTOR_PROJECT_ROOT 로 프로젝트 폴더를 지정하세요.`
