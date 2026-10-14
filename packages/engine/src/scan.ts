import { DEFAULT_VIEWPORTS } from '@inspector-agent/verifier'
import type { Scenario, Viewport } from '@inspector-agent/core'
import type { Env } from './env'
import { EngineError } from './errors'
import { ingestScanResults } from './ingest'
import { AUTO_PRUNE_AFTER_MS } from './patch-cleanup'
import { pruneDisposablePatches } from './patches'
import type { ScanIngestResult } from './types'

/** 헤드리스 브라우저로 URL 을 여러 뷰포트에서 스캔하고(자동 탐색 포함) 결과를 저장소에 병합한다 */
export const scanAndIngest = async (env: Env, url: string, viewports?: Viewport[], scenario?: Scenario): Promise<ScanIngestResult & { defects: number }> => {
  if (!/^https?:\/\//.test(url)) throw new EngineError('http(s) url 이 필요합니다.', 400)
  const results = await env.deps
    .scan(url, viewports?.length ? viewports : DEFAULT_VIEWPORTS, { executablePath: env.config.chromiumPath, scenario })
    .catch((error: unknown): never => {
      const message = error instanceof Error ? error.message : String(error)
      // 시나리오 단계 실패(셀렉터 오타 등)는 요청한 쪽이 고칠 수 있는 오류다
      throw new EngineError(message, message.startsWith('시나리오') ? 422 : 500)
    })
  const summary = await ingestScanResults(env, results, scenario)
  // 처리가 끝난 지 7일이 지난 패치 기록과 백업은 스캔할 때마다 정리한다(정리 실패가 스캔을 막지 않게 한다)
  await pruneDisposablePatches(env, { olderThanMs: AUTO_PRUNE_AFTER_MS }).catch((): number => 0)
  return { ...summary, defects: results.reduce((sum, result): number => sum + result.defects.length, 0) }
}
