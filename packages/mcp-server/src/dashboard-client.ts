import type { AgentDefectPayload, Defect, PatchEdit, Viewport } from '@inspector-agent/core'

/**
 * 대시보드 Nitro API 의 얇은 클라이언트.
 * MCP 서버는 상태를 갖지 않고 모든 저장·적용·검증을 대시보드에 위임한다.
 */

interface StyleRule {
  selector: string
  line: number
  atRules: string[]
  declarations: Array<{ property: string; value: string; line: number }>
}

export interface DefectSummary extends Defect {
  status: string
}

export interface DefectContextResponse {
  defect: DefectSummary
  payload: AgentDefectPayload
  file?: string
  template?: { startLine: number; endLine: number; text: string }
  nodeRules: StyleRule[]
  parentRules: StyleRule[]
  childRules: StyleRule[]
  outline?: {
    templateRange?: { startLine: number; endLine: number }
    styleRanges: Array<{ startLine: number; endLine: number; lang: string; scoped: boolean }>
  }
  tokens: { context: number; rawFile: number }
}

export interface PatchResponse {
  id: string
  defectId: string
  file: string
  status: string
  diff: string
  rationale: string
  autoRolledBack?: boolean
  error?: string
  verification?: {
    passed: boolean
    verdict: string
    beforePx: number
    afterPx: number
    regressions: Defect[]
  }
}

export class DashboardError extends Error {}

export interface DashboardClient {
  scan: (url: string, viewports?: Viewport[]) => Promise<{ defects: number; created: number; resolved: number }>
  listDefects: (status?: string) => Promise<DefectSummary[]>
  getContext: (defectId: string) => Promise<DefectContextResponse>
  proposePatch: (input: { defectId: string; file: string; edits: PatchEdit[]; rationale: string }) => Promise<PatchResponse>
  getPatch: (patchId: string) => Promise<PatchResponse>
  applyPatch: (patchId: string) => Promise<PatchResponse>
}

export const createDashboardClient = (baseUrl: string): DashboardClient => {
  const request = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    let response: Response
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: init?.method ?? 'GET',
        headers: init?.body ? { 'content-type': 'application/json' } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined
      })
    } catch (error) {
      throw new DashboardError(`대시보드(${baseUrl})에 연결할 수 없습니다. 'pnpm dev:dashboard' 가 실행 중인지 확인하세요. (${(error as Error).message})`)
    }
    const data = (await response.json().catch((): undefined => undefined)) as (T & { statusMessage?: string }) | undefined
    if (!response.ok) throw new DashboardError(data?.statusMessage ?? `대시보드 응답 오류 ${response.status}`)
    return data as T
  }

  return {
    scan: (url: string, viewports?: Viewport[]): Promise<{ defects: number; created: number; resolved: number }> =>
      request('/api/scan', { method: 'POST', body: { url, viewports } }),
    listDefects: (status?: string): Promise<DefectSummary[]> =>
      request(`/api/defects${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    getContext: (defectId: string): Promise<DefectContextResponse> =>
      request(`/api/defects/${encodeURIComponent(defectId)}/context`),
    proposePatch: (input: { defectId: string; file: string; edits: PatchEdit[]; rationale: string }): Promise<PatchResponse> =>
      request('/api/patches', { method: 'POST', body: { ...input, author: 'agent' } }),
    getPatch: (patchId: string): Promise<PatchResponse> => request(`/api/patches/${encodeURIComponent(patchId)}`),
    applyPatch: (patchId: string): Promise<PatchResponse> =>
      request(`/api/patches/${encodeURIComponent(patchId)}/apply`, { method: 'POST' })
  }
}
