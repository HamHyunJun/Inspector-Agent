import type { ScanResult } from '@inspector-agent/core'
import type { ScanIngestResult } from '../../shared/types/inspector'
import { ingestScanResults } from '../utils/ingest'

/** 확장 또는 CLI 가 수집한 스캔 결과를 받는다 */
export default defineEventHandler(async (event): Promise<ScanIngestResult> => {
  const body = await readBody<{ results?: ScanResult[] }>(event)
  if (!Array.isArray(body?.results)) {
    throw createError({ statusCode: 400, statusMessage: 'results 배열이 필요합니다.' })
  }
  return ingestScanResults(body.results)
})
