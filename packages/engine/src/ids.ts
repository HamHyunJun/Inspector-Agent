import { randomUUID } from 'node:crypto'
import { EngineError } from './errors'

/**
 * 결함·패치 id 는 외부(에이전트, HTTP, 스캔 결과)에서 들어오는 문자열이다.
 * 형식을 제한하고 자기 소유 키만 조회해서 `__proto__`, `constructor` 같은 키가 저장소 객체의 프로토타입으로 새지 않게 한다.
 */
const DEFECT_ID = /^d_[a-z0-9]+$/
const PATCH_ID = /^p_[a-z0-9]+$/

export const isPatchId = (id: string): boolean => PATCH_ID.test(id)

export const assertDefectId = (id: string): void => {
  if (!DEFECT_ID.test(id)) throw new EngineError(`결함을 찾을 수 없습니다: ${id}`, 404)
}

export const assertPatchId = (id: string): void => {
  if (!PATCH_ID.test(id)) throw new EngineError(`패치를 찾을 수 없습니다: ${id}`, 404)
}

/** 프로토타입 체인을 거치지 않고 자기 소유 키만 읽는다 */
export const own = <T>(record: Record<string, T>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)

export const createPatchId = (): string => `p_${randomUUID().replaceAll('-', '').slice(0, 16)}`
