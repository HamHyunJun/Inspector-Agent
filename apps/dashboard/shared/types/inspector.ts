import type { AgentDefectPayload, Defect, PatchEdit } from '@inspector-agent/core'
import type { SfcOutline, SourceSnippet, StyleRuleMatch } from '@inspector-agent/source-locator'
import type { VerificationResult } from '@inspector-agent/verifier'

/** 서버(Nitro)와 화면(app)이 함께 쓰는 대시보드 도메인 타입 */

export type DefectStatus = 'open' | 'patched' | 'resolved'

export interface StoredDefect extends Defect {
  status: DefectStatus
  firstSeenAt: string
  lastSeenAt: string
  occurrences: number
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
