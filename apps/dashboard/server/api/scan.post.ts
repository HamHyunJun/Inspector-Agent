import type { Viewport } from '@inspector-agent/core'
import { DEFAULT_VIEWPORTS, scanPage } from '@inspector-agent/verifier'
import type { ScanIngestResult } from '../../shared/types/inspector'
import { getInspectorConfig } from '../utils/config'
import { ingestScanResults } from '../utils/ingest'

/** 서버에서 직접 헤드리스 브라우저로 URL 을 여러 뷰포트에서 스캔한다 (MCP scan_page 가 사용) */
export default defineEventHandler(async (event): Promise<ScanIngestResult & { defects: number }> => {
  const body = await readBody<{ url?: string; viewports?: Viewport[] }>(event)
  if (!body?.url || !/^https?:\/\//.test(body.url)) {
    throw createError({ statusCode: 400, statusMessage: 'http(s) url 이 필요합니다.' })
  }
  const viewports = body.viewports?.length ? body.viewports : DEFAULT_VIEWPORTS
  const results = await scanPage(body.url, viewports, { executablePath: getInspectorConfig().chromiumPath })
  const summary = await ingestScanResults(results)
  return { ...summary, defects: results.reduce((sum, result): number => sum + result.defects.length, 0) }
})
