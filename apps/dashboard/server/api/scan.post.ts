import type { Viewport } from '@inspector-agent/core'
import type { ScanIngestResult } from '../../shared/types/inspector'
import { withEngine } from '../utils/engine'
import { parseScenarioBody } from '../utils/scenario-body'

/** 서버에서 직접 헤드리스 브라우저로 URL 을 여러 뷰포트에서 스캔한다 (MCP scan_page 의 대시보드 모드가 사용) */
export default defineEventHandler(async (event): Promise<ScanIngestResult & { defects: number }> => {
  const body = await readBody<{ url?: string; viewports?: Viewport[]; scenario?: unknown }>(event)
  if (!body?.url) throw createError({ statusCode: 400, statusMessage: 'http(s) url 이 필요합니다.' })
  const scenario = parseScenarioBody(body.scenario)
  const url = body.url
  return withEngine((engine) => engine.scan(url, body.viewports, scenario))
})
