import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Defect, Scenario } from '@inspector-agent/core'
import type { Patch, StoredDefect } from './types'

/**
 * 단일 JSON 파일 저장소. 로컬 개발 도구이므로 DB 대신 사람이 열어 볼 수 있는 파일을 쓴다.
 * 한 프로세스 안의 변경은 직렬화된 큐로 처리해 동시 요청에서도 마지막 쓰기가 앞선 쓰기를 덮지 않게 하고,
 * 쓰기는 임시 파일 후 rename 이라 읽는 쪽이 깨진 파일을 보지 않는다.
 * shortcut: 프로세스(MCP 서버, 대시보드)가 둘 이상 같은 파일을 동시에 고치면 마지막 쓰기가 이기는 경쟁이 있다, 동시 사용이 잦아지면 파일 잠금으로 업그레이드
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

export interface Store {
  read: () => Promise<StoreData>
  update: <T>(mutate: (data: StoreData) => T | Promise<T>) => Promise<T>
}

const emptyStore = (): StoreData => ({ defects: {}, patches: {}, baselines: {}, scenarios: {} })

export const createStore = (dataDir: string): Store => {
  const path = join(dataDir, 'store.json')
  let queue: Promise<unknown> = Promise.resolve()

  const read = async (): Promise<StoreData> => {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
      throw error
    }
    try {
      return { ...emptyStore(), ...(JSON.parse(raw) as Partial<StoreData>) }
    } catch {
      // 깨진 파일을 빈 저장소로 보고 덮어쓰면 적용된 패치의 기록(롤백 기준)이 사라진다. 멈추고 알린다
      throw new Error(`${path} 를 읽을 수 없습니다(JSON 이 손상됨). 파일을 확인하거나 지우면 초기화됩니다. 롤백이 필요하면 backups/ 의 .bak 을 쓰세요.`)
    }
  }

  const write = async (data: StoreData): Promise<void> => {
    await mkdir(dataDir, { recursive: true })
    // 사용자 프로젝트 안에 만들어지므로 결함 기록과 백업이 실수로 커밋되지 않게 이 폴더 전체를 git 에서 제외한다
    await writeFile(join(dataDir, '.gitignore'), '*\n', { flag: 'wx' }).catch((): undefined => undefined)
    // 프로세스가 둘 이상(MCP 서버 두 개 등)이어도 임시 파일 이름이 겹치지 않게 한다
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(data, undefined, 2), 'utf8')
    await rename(temp, path)
  }

  /** 읽기-수정-쓰기를 직렬화해 실행하고 mutate 의 반환값을 돌려준다 */
  const update = <T>(mutate: (data: StoreData) => T | Promise<T>): Promise<T> => {
    const task = queue.then(async (): Promise<T> => {
      const data = await read()
      const result = await mutate(data)
      await write(data)
      return result
    })
    queue = task.catch((): undefined => undefined)
    return task
  }

  return { read, update }
}

export const baselineKey = (url: string, viewportWidth: number, scenarioKey?: string): string =>
  `${url}|${viewportWidth}${scenarioKey ? `|${scenarioKey}` : ''}`
