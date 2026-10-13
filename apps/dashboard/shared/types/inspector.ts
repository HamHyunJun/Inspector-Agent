import type { AgentDefectPayload, Defect, PatchEdit } from '@inspector-agent/core'
import type { SfcOutline, SourceSnippet, StyleRuleMatch } from '@inspector-agent/source-locator'
import type { VerificationResult } from '@inspector-agent/verifier'

/** 서버(Nitro)와 화면(app)이 함께 쓰는 대시보드 도메인 타입 */

export type DefectStatus = 'open' | 'patched' | 'resolved'

/** Defect 가 kind 별 합집합이라 interface extends 대신 교차 타입으로 확장한다 */
export type StoredDefect = Defect & {
  status: DefectStatus
  firstSeenAt: string
  lastSeenAt: string
  occurrences: number
}

/** 같은 소스 위치·뷰포트의 결함이 발생한 URL 하나 */
export interface DefectGroupMember {
  id: string
  url: string
  status: DefectStatus
}

/** URL 이 달라도 같은 소스 위치·뷰포트(같은 fingerprint)인 결함을 묶은 것. 고칠 곳은 한 곳이다 */
export interface DefectGroupSummary {
  key: string
  /** 대표 결함: 상세 화면과 패치는 이 결함 기준 */
  defect: StoredDefect
  /** 하나라도 open 이면 open, 아니면 patched 가 있으면 patched, 모두 resolved 일 때만 resolved */
  status: DefectStatus
  members: DefectGroupMember[]
}

export type PatchStatus = 'proposed' | 'verified' | 'failed' | 'rolled-back' | 'rejected'

export interface Patch {
  id: string
  defectId: string
  /** 대상 프로젝트 루트 기준 상대 경로 */
  file: string
  edits: PatchEdit[]
  rationale: string
  /** agent: MCP 로 제안한 LLM 패치, rule: 결정론적 진단 기반 기준선 패치, human: 직접 작성 */
  author: 'agent' | 'rule' | 'human'
  status: PatchStatus
  /** 표시용 unified diff */
  diff: string
  /** 제안 시점 원본 내용의 해시. 적용 시 파일이 바뀌었으면 충돌로 거부한다 */
  originalHash: string
  createdAt: string
  appliedAt?: string
  rolledBackAt?: string
  verification?: VerificationResult
  /** 검증 실패로 자동 롤백되었는지 */
  autoRolledBack?: boolean
  error?: string
}

export interface DefectContext {
  defect: StoredDefect
  payload: AgentDefectPayload
  file?: string
  template?: SourceSnippet
  nodeRules: StyleRuleMatch[]
  parentRules: StyleRuleMatch[]
  /** 직계 자식 클래스를 대상으로 하는 규칙 (원인이 자식에 있는 경우) */
  childRules: StyleRuleMatch[]
  outline?: SfcOutline
  tokens: {
    /** 압축 페이로드 + 소스 컨텍스트 */
    context: number
    /** 같은 파일 전체를 그대로 넘겼을 때 */
    rawFile: number
  }
}

export interface DashboardStats {
  defects: Record<DefectStatus, number>
  patches: Record<PatchStatus, number>
  /** verified / (verified + failed). 시도가 없으면 undefined */
  successRate?: number
  lastScanAt?: string
}

export interface ScanIngestResult {
  received: number
  created: number
  updated: number
  resolved: number
}
