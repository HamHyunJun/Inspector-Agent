import { measureDefect, scanPage } from '@inspector-agent/verifier'
import type { EngineConfig } from './config'
import { createProjectFiles } from './project-files'
import type { ProjectFiles } from './project-files'
import { createStore } from './store'
import type { Store } from './store'

/** 스캔과 재측정은 브라우저가 필요하므로 테스트에서 가짜로 바꿀 수 있게 주입한다 */
export interface EngineDeps {
  measure: typeof measureDefect
  scan: typeof scanPage
}

/** 엔진 내부 모듈들이 공유하는 의존성 묶음 */
export interface Env {
  config: EngineConfig
  store: Store
  files: ProjectFiles
  deps: EngineDeps
  /** 같은 프로세스 안의 패치 적용·롤백을 한 번에 하나씩 실행한다(같은 파일을 동시에 고쳐 서로 덮어쓰지 않게) */
  serial: <T>(task: () => Promise<T>) => Promise<T>
}

export const createEnv = (config: EngineConfig, deps: Partial<EngineDeps> = {}): Env => {
  let queue: Promise<unknown> = Promise.resolve()
  return {
    config,
    store: createStore(config.dataDir),
    files: createProjectFiles(config),
    deps: { measure: measureDefect, scan: scanPage, ...deps },
    serial: <T>(task: () => Promise<T>): Promise<T> => {
      const run = queue.then(task)
      queue = run.catch((): undefined => undefined)
      return run
    }
  }
}
