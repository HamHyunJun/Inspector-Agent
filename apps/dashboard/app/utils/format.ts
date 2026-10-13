import type { FixSuggestion, OcclusionMetrics, Severity } from '@inspector-agent/core'
import type { DefectStatus, PatchStatus } from '~~/shared/types/inspector'

export const SEVERITY_LABEL: Record<Severity, string> = { high: '높음', medium: '보통', low: '낮음' }

export const DEFECT_STATUS_LABEL: Record<DefectStatus, string> = {
  open: '미해결',
  patched: '패치 반영됨',
  resolved: '해결됨'
}

export const PATCH_STATUS_LABEL: Record<PatchStatus, string> = {
  proposed: '검토 대기',
  verified: '검증 통과',
  failed: '검증 실패',
  'rolled-back': '롤백됨',
  rejected: '거절됨'
}

export const formatPx = (value: number): string => `${Math.round(value)}px`

/** 재측정 수치 표기. 오버플로우는 px, 가려짐은 가려진 비율 */
export const formatMeasure = (value: number, unit: 'px' | 'ratio' | 'count' = 'px'): string =>
  unit === 'ratio' ? `${Math.round(value * 100)}%` : unit === 'count' ? `${value}방향` : formatPx(value)

export const OCCLUSION_CAUSE_LABEL: Record<OcclusionMetrics['cause'], string> = {
  'stacking-context': '조상 stacking context 에 갇혀 가려짐',
  'z-index': '같은 컨텍스트에서 z-index 가 낮아 가려짐',
  'overflow-clip': '조상 overflow 에 잘려 가려짐',
  unknown: '가려짐 (원인 미분류)'
}

export const TARGET_LABEL: Record<FixSuggestion['target'], string> = { node: '노드', parent: '부모', ancestor: '조상' }

export const formatPercent = (value: number | undefined): string =>
  value === undefined ? '-' : `${Math.round(value * 100)}%`

export const formatDateTime = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }) : '-'

export const formatSourceRef = (file: string | undefined, line: number | undefined): string =>
  file ? `${file}:${line ?? 1}` : '소스 정보 없음'
