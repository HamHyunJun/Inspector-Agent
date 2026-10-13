import { isAbsolute, resolve } from 'node:path'

export interface InspectorConfig {
  projectRoot: string
  dataDir: string
  settleMs: number
  chromiumPath?: string
}

/** 런타임 설정을 절대 경로로 정규화한다 (상대 경로는 대시보드 실행 위치 기준) */
export const getInspectorConfig = (): InspectorConfig => {
  const config = useRuntimeConfig()
  const toAbsolute = (path: string): string => (isAbsolute(path) ? path : resolve(process.cwd(), path))
  return {
    projectRoot: toAbsolute(String(config.projectRoot)),
    dataDir: toAbsolute(String(config.dataDir)),
    settleMs: Number(config.settleMs),
    chromiumPath: config.chromiumPath ? String(config.chromiumPath) : undefined
  }
}
