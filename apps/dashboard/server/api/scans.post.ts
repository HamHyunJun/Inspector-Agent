import type { ScanResult } from '@inspector-agent/core'
import type { ScanIngestResult } from '../../shared/types/inspector'
import { ingestScanResults } from '../utils/ingest'
import { parseScenarioBody } from '../utils/scenario-body'

/** 확장 또는 CLI 가 수집한 스캔 결과를 받는다 */
export default defineEventHandler(async (event): Promise<ScanIngestResult> => {
  const body = await readBody<{ results?: ScanResult[]; scenario?: unknown }>(event)
  if (!Array.isArray(body?.results)) {
    throw createError({ statusCode: 400, statusMessage: 'results 배열이 필요합니다.' })
  }
  const scenario = parseScenarioBody(body.scenario)
  return ingestScanResults(body.results, scenario).catch((error: unknown): never => {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : String(error) })
  })
})
