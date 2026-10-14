import { EngineError, createEngine, resolveConfig } from '@inspector-agent/engine'
import type { Engine } from '@inspector-agent/engine'

let engine: Engine | undefined

/** 대시보드의 런타임 설정으로 만든 엔진. 상대 경로는 대시보드 실행 위치 기준이다 */
export const getEngine = (): Engine => {
  if (engine) return engine
  const config = useRuntimeConfig()
  engine = createEngine(
    resolveConfig({
      projectRoot: String(config.projectRoot),
      dataDir: String(config.dataDir),
      settleMs: Number(config.settleMs),
      chromiumPath: config.chromiumPath ? String(config.chromiumPath) : undefined
    })
  )
  return engine
}

/** 엔진 오류를 HTTP 응답으로 바꿔 실행한다 */
export const withEngine = async <T>(task: (engine: Engine) => Promise<T>): Promise<T> => {
  try {
    return await task(getEngine())
  } catch (error) {
    if (error instanceof EngineError) throw createError({ statusCode: error.status, statusMessage: error.message })
    throw error
  }
}
