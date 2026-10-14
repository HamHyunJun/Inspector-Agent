import type { ScanResult, Scenario, Viewport } from '@inspector-agent/core'
import { buildDefectContext } from './context'
import { createEnv } from './env'
import type { EngineDeps } from './env'
import type { EngineConfig } from './config'
import { EngineError } from './errors'
import { assertDefectId, own } from './ids'
import { ingestScanResults } from './ingest'
import { applyPatch, getPatch, proposePatch, proposeRulePatch, rejectPatch, rollbackPatch } from './patches'
import type { ProposePatchInput } from './patches'
import { listGroups } from './queries'
import { scanAndIngest } from './scan'
import type { DefectContext, DefectStatus, ScanIngestResult } from './types'

/**
 * 대시보드 없이 쓰는 엔진: 스캔, 결함 저장, 컨텍스트, 패치 제안·적용·재측정·자동 롤백.
 * MCP 서버, inspector-agent CLI, 대시보드가 같은 엔진을 쓴다.
 */
export const createEngine = (config: EngineConfig, deps: Partial<EngineDeps> = {}) => {
  const env = createEnv(config, deps)
  return {
    config,
    scan: (url: string, viewports?: Viewport[], scenario?: Scenario, variants?: string[]): Promise<ScanIngestResult & { defects: number }> => scanAndIngest(env, url, viewports, scenario, variants),
    ingest: (results: ScanResult[], scenario?: Scenario): Promise<ScanIngestResult> => ingestScanResults(env, results, scenario),
    listGroups: (status?: DefectStatus) => listGroups(env, status),
    getContext: async (defectId: string): Promise<DefectContext> => {
      assertDefectId(defectId)
      const defect = own((await env.store.read()).defects, defectId)
      if (!defect) throw new EngineError(`결함을 찾을 수 없습니다: ${defectId}`, 404)
      return buildDefectContext(env, defect)
    },
    getPatch: (patchId: string) => getPatch(env, patchId),
    proposePatch: (input: ProposePatchInput) => proposePatch(env, input),
    proposeRulePatch: (defectId: string, suggestionIndex?: number) => proposeRulePatch(env, defectId, suggestionIndex),
    applyPatch: (patchId: string, options?: { autoRollback?: boolean }) => applyPatch(env, patchId, options),
    rollbackPatch: (patchId: string) => rollbackPatch(env, patchId),
    rejectPatch: (patchId: string) => rejectPatch(env, patchId)
  }
}

export type Engine = ReturnType<typeof createEngine>
