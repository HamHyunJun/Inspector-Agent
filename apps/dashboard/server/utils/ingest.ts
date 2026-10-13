import type { ScanResult } from '@inspector-agent/core'
import type { ScanIngestResult, StoredDefect } from '../../shared/types/inspector'
import { baselineKey, updateStore } from './store'

/**
 * 스캔 결과를 저장소에 병합한다.
 * - 같은 id(같은 페이지·소스 위치·뷰포트)는 갱신, 새 id는 추가
 * - 같은 url·뷰포트를 다시 스캔했는데 사라진 미해결 결함은 resolved 로 전환
 */
export const ingestScanResults = (results: ScanResult[]): Promise<ScanIngestResult> =>
  updateStore((data): ScanIngestResult => {
    const now = new Date().toISOString()
    const summary: ScanIngestResult = { received: 0, created: 0, updated: 0, resolved: 0 }

    for (const result of results) {
      const seen = new Set<string>()
      for (const defect of result.defects) {
        summary.received++
        seen.add(defect.id)
        const existing = data.defects[defect.id]
        if (existing) {
          const status = existing.status === 'resolved' ? 'open' : existing.status
          data.defects[defect.id] = {
            ...existing,
            ...defect,
            status,
            lastSeenAt: now,
            occurrences: existing.occurrences + 1
          }
          summary.updated++
        } else {
          const stored: StoredDefect = { ...defect, status: 'open', firstSeenAt: now, lastSeenAt: now, occurrences: 1 }
          data.defects[defect.id] = stored
          summary.created++
        }
      }

      for (const stored of Object.values(data.defects)) {
        const sameTarget = stored.url === result.url && stored.viewport.width === result.viewport.width
        if (sameTarget && stored.status === 'open' && !seen.has(stored.id)) {
          stored.status = 'resolved'
          summary.resolved++
        }
      }

      data.baselines[baselineKey(result.url, result.viewport.width)] = result.defects
    }

    data.lastScanAt = now
    return summary
  })
