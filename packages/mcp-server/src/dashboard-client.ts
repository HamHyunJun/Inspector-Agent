import type { Defect, PatchEdit, Viewport } from '@inspector-agent/core'
import type { DefectContext, Patch } from '@inspector-agent/engine'

/**
 * MCP 도구가 쓰는 백엔드. 대시보드 Nitro API 클라이언트(INSPECTOR_DASHBOARD_URL 이 있을 때)와
 * 대시보드 없이 엔진을 직접 쓰는 구현(engine-backend.ts, 기본)이 같은 모양을 따른다.
 */

/** Defect 가 kind 별 합집합이라 interface extends 대신 교차 타입으로 확장한다 */
export type DefectSummary = Defect & { status: string }

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶은 목록 항목. status 는 URL 별 상태를 합친 값, urls 는 발생한 경로 */
export type DefectListItem = DefectSummary & { urls: string[] }

/** 응답 모양은 엔진과 대시보드 API 가 같다 */
export type DefectContextResponse = DefectContext
export type PatchResponse = Patch

export class DashboardError extends Error {}

const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

export interface Backend {
  scan: (url: string, viewports?: Viewport[], scenario?: unknown) => Promise<{ defects: number; created: number; resolved: number }>
  listDefects: (status?: string) => Promise<DefectListItem[]>
  getContext: (defectId: string) => Promise<DefectContextResponse>
  proposePatch: (input: { defectId: string; file: string; edits: PatchEdit[]; rationale: string }) => Promise<PatchResponse>
  getPatch: (patchId: string) => Promise<PatchResponse>
  applyPatch: (patchId: string) => Promise<PatchResponse>
}

export const createDashboardClient = (baseUrl: string): Backend => {
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
    scan: (url: string, viewports?: Viewport[], scenario?: unknown): Promise<{ defects: number; created: number; resolved: number }> =>
      request('/api/scan', { method: 'POST', body: { url, viewports, scenario } }),
    listDefects: async (status?: string): Promise<DefectListItem[]> => {
      const groups = await request<Array<{ defect: Defect; status: string; members: Array<{ url: string }> }>>(
        `/api/defect-groups${status ? `?status=${encodeURIComponent(status)}` : ''}`
      )
      return groups.map((group): DefectListItem => ({ ...group.defect, status: group.status, urls: group.members.map((member): string => pathOf(member.url)) }))
    },
    getContext: (defectId: string): Promise<DefectContextResponse> =>
      request(`/api/defects/${encodeURIComponent(defectId)}/context`),
    proposePatch: (input: { defectId: string; file: string; edits: PatchEdit[]; rationale: string }): Promise<PatchResponse> =>
      request('/api/patches', { method: 'POST', body: { ...input, author: 'agent' } }),
    getPatch: (patchId: string): Promise<PatchResponse> => request(`/api/patches/${encodeURIComponent(patchId)}`),
    applyPatch: (patchId: string): Promise<PatchResponse> =>
      request(`/api/patches/${encodeURIComponent(patchId)}/apply`, { method: 'POST' })
  }
}
