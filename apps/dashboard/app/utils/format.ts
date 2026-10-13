import type { Severity } from '@inspector-agent/core'
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

export const formatPercent = (value: number | undefined): string =>
  value === undefined ? '-' : `${Math.round(value * 100)}%`

export const formatDateTime = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }) : '-'

export const formatSourceRef = (file: string | undefined, line: number | undefined): string =>
  file ? `${file}:${line ?? 1}` : '소스 정보 없음'
