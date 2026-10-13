import type { Viewport } from '@inspector-agent/core'
import { DEFAULT_VIEWPORTS, scanPage } from '@inspector-agent/verifier'
import type { ScanIngestResult } from '../../shared/types/inspector'
import { getInspectorConfig } from '../utils/config'
import { ingestScanResults } from '../utils/ingest'
import { parseScenarioBody } from '../utils/scenario-body'

/** 서버에서 직접 헤드리스 브라우저로 URL 을 여러 뷰포트에서 스캔한다 (MCP scan_page 가 사용) */
export default defineEventHandler(async (event): Promise<ScanIngestResult & { defects: number }> => {
  const body = await readBody<{ url?: string; viewports?: Viewport[]; scenario?: unknown }>(event)
  if (!body?.url || !/^https?:\/\//.test(body.url)) {
    throw createError({ statusCode: 400, statusMessage: 'http(s) url 이 필요합니다.' })
  }
  const viewports = body.viewports?.length ? body.viewports : DEFAULT_VIEWPORTS
  const scenario = parseScenarioBody(body.scenario)
  const results = await scanPage(body.url, viewports, { executablePath: getInspectorConfig().chromiumPath, scenario }).catch((error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error)
    // 시나리오 단계 실패(셀렉터 오타 등)는 요청한 쪽이 고칠 수 있는 오류다
    throw createError({ statusCode: message.startsWith('시나리오') ? 422 : 500, statusMessage: message })
  })
  const summary = await ingestScanResults(results, scenario)
  return { ...summary, defects: results.reduce((sum, result): number => sum + result.defects.length, 0) }
})
