import type { Defect, PatchEdit, Viewport } from '@inspector-agent/core'
import type { DefectContext, Patch } from '@inspector-agent/engine'

/** MCP 도구가 쓰는 백엔드의 모양. 구현은 엔진을 직접 쓰는 engine-backend.ts 하나다 */

/** Defect 가 kind 별 합집합이라 interface extends 대신 교차 타입으로 확장한다 */
export type DefectSummary = Defect & { status: string }

/** 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶은 목록 항목. status 는 URL 별 상태를 합친 값, urls 는 발생한 경로 */
export type DefectListItem = DefectSummary & { urls: string[] }

/** 응답 모양은 엔진의 것과 같다 */
export type DefectContextResponse = DefectContext
export type PatchResponse = Patch

export interface Backend {
  scan: (url: string, viewports?: Viewport[], scenario?: unknown) => Promise<{ defects: number; created: number; resolved: number }>
  listDefects: (status?: string) => Promise<DefectListItem[]>
  getContext: (defectId: string) => Promise<DefectContextResponse>
  proposePatch: (input: { defectId: string; file: string; edits: PatchEdit[]; rationale: string }) => Promise<PatchResponse>
  getPatch: (patchId: string) => Promise<PatchResponse>
  applyPatch: (patchId: string) => Promise<PatchResponse>
}
