import { scenarioKey } from '@inspector-agent/core'
import type { ScanResult, Scenario } from '@inspector-agent/core'
import type { ScanIngestResult, StoredDefect } from '../../shared/types/inspector'
import { baselineKey, updateStore } from './store'

/**
 * 스캔 결과를 저장소에 병합한다.
 * - 같은 id(같은 페이지·소스 위치·뷰포트)는 갱신, 새 id는 추가

 * - 같은 url·뷰포트·시나리오를 다시 스캔했는데 사라진 미해결 결함은 resolved 로 전환
 *   (시나리오가 다르면 다른 상태의 화면이므로 서로를 해결로 바꾸지 않는다)
 * - 시나리오로 스캔했다면 패치 후 재측정이 같은 상태를 만들 수 있도록 시나리오를 함께 보관한다
 */
export const ingestScanResults = (results: ScanResult[], scenario?: Scenario): Promise<ScanIngestResult> => {
  const key = scenario ? scenarioKey(scenario) : undefined
  // 시나리오 없이 키만 달고 온 결과는 재측정할 수 없는 결함을 만들므로 받지 않는다
  if (results.some((result): boolean => result.scenarioKey !== key)) {
    throw new Error('스캔 결과의 시나리오 키가 함께 보낸 시나리오와 맞지 않습니다.')
  }
  return updateStore((data): ScanIngestResult => {
    if (scenario && key) data.scenarios[key] = scenario
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
        const sameTarget = stored.url === result.url && stored.viewport.width === result.viewport.width && stored.scenarioKey === result.scenarioKey
        if (sameTarget && stored.status === 'open' && !seen.has(stored.id)) {
          stored.status = 'resolved'
          summary.resolved++
        }
      }

      data.baselines[baselineKey(result.url, result.viewport.width, result.scenarioKey)] = result.defects
    }

    data.lastScanAt = now
    return summary
  })
}
