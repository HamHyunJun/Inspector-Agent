import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Defect, Scenario } from '@inspector-agent/core'
import type { Patch, StoredDefect } from '../../shared/types/inspector'
import { getInspectorConfig } from './config'

/**
 * 단일 JSON 파일 저장소. 로컬 개발 도구이므로 DB 대신 사람이 열어 볼 수 있는 파일을 쓴다.
 * 모든 변경은 직렬화된 큐로 처리해 동시 요청에서도 마지막 쓰기가 앞선 쓰기를 덮지 않게 한다.
 */
export interface StoreData {
  defects: Record<string, StoredDefect>
  patches: Record<string, Patch>
  /** url|viewportWidth(|시나리오 키) → 직전 스캔 결함 목록. 검증 시 회귀 판정 기준선 */
  baselines: Record<string, Defect[]>
  /** 시나리오 키 → 시나리오. 패치 후 재측정이 스캔 때와 같은 상태를 만들 수 있게 보관한다(평문 저장이므로 비밀 값은 넣지 않는다) */
  scenarios: Record<string, Scenario>
  lastScanAt?: string
}

const emptyStore = (): StoreData => ({ defects: {}, patches: {}, baselines: {}, scenarios: {} })

let queue: Promise<unknown> = Promise.resolve()

const storePath = (): string => join(getInspectorConfig().dataDir, 'store.json')

export const readStore = async (): Promise<StoreData> => {
  try {
    const raw = await readFile(storePath(), 'utf8')
    return { ...emptyStore(), ...(JSON.parse(raw) as Partial<StoreData>) }
  } catch {
    return emptyStore()
  }
}

const writeStore = async (data: StoreData): Promise<void> => {
  const path = storePath()
  await mkdir(getInspectorConfig().dataDir, { recursive: true })
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(data, undefined, 2), 'utf8')
  await rename(temp, path)
}

/** 읽기-수정-쓰기를 직렬화해 실행하고 mutate 의 반환값을 돌려준다 */
export const updateStore = <T>(mutate: (data: StoreData) => T | Promise<T>): Promise<T> => {
  const task = queue.then(async (): Promise<T> => {
    const data = await readStore()
    const result = await mutate(data)
    await writeStore(data)
    return result
  })
  queue = task.catch((): undefined => undefined)
  return task
}

export const baselineKey = (url: string, viewportWidth: number, scenarioKey?: string): string =>
  `${url}|${viewportWidth}${scenarioKey ? `|${scenarioKey}` : ''}`
