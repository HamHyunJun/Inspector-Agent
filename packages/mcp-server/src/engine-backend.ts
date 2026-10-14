import { parseScenario } from '@inspector-agent/core'
import type { Viewport } from '@inspector-agent/core'
import type { Engine } from '@inspector-agent/engine'
import type { Backend, DefectListItem } from './dashboard-client'

const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** 대시보드 없이 엔진을 직접 쓰는 백엔드. 스캔, 저장, 컨텍스트, 패치 제안·적용이 모두 이 프로세스 안에서 일어난다 */
export const createEngineBackend = (engine: Engine): Backend => ({
  // 시나리오는 에이전트가 만든 신뢰할 수 없는 입력이므로 형식과 한도를 검증한다
  scan: (url: string, viewports?: Viewport[], scenario?: unknown) => engine.scan(url, viewports, scenario === undefined ? undefined : parseScenario(scenario)),
  listDefects: async (status?: string): Promise<DefectListItem[]> => {
    const groups = await engine.listGroups(status === 'open' || status === 'patched' || status === 'resolved' ? status : undefined)
    return groups.map((group): DefectListItem => ({ ...group.defect, status: group.status, urls: group.members.map((member): string => pathOf(member.url)) }))
  },
  getContext: (defectId: string) => engine.getContext(defectId),
  proposePatch: (input) => engine.proposePatch({ ...input, author: 'agent' }),
  getPatch: (patchId: string) => engine.getPatch(patchId),
  applyPatch: (patchId: string) => engine.applyPatch(patchId)
})
