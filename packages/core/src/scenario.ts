import { hashString } from './fingerprint'
import { DEVICE_PROFILES } from './types'
import type { Scenario, ScenarioEnvironment, ScenarioSeed, ScenarioStep } from './types'

/**
 * 시나리오 검증. 대시보드 API, CLI 파일, MCP 도구 인자처럼 신뢰할 수 없는 곳에서 들어오므로
 * 모양, 크기, 알 수 없는 필드를 엄격하게 검사하고 한국어 오류로 알려 준다.
 */

export const MAX_SCENARIO_STEPS = 50
export const MAX_WAIT_MS = 10_000
const MAX_SELECTOR_LENGTH = 300
const MAX_STORAGE_KEYS = 100
const MAX_COOKIES = 20
const MAX_SEED_BYTES = 512 * 1024
const STEP_ACTIONS = ['click', 'hover', 'fill', 'wait'] as const

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const rejectUnknown = (record: Record<string, unknown>, allowed: string[], where: string): void => {
  const unknown = Object.keys(record).filter((key): boolean => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${where}: 알 수 없는 필드 ${unknown.map((key): string => `"${key}"`).join(', ')} (허용: ${allowed.join(', ')})`)
}

const text = (value: unknown, where: string, max = MAX_SELECTOR_LENGTH): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${where}: 비어 있지 않은 문자열이어야 합니다`)
  if (value.length > max) throw new Error(`${where}: ${max}자 이하여야 합니다`)
  return value
}

const parseStorage = (value: unknown, where: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${where}: 객체여야 합니다`)
  if (Object.keys(value).length > MAX_STORAGE_KEYS) throw new Error(`${where}: 키는 ${MAX_STORAGE_KEYS}개 이하여야 합니다`)
  return value
}

const parseSeed = (value: unknown): ScenarioSeed => {
  if (!isRecord(value)) throw new Error('seed: 객체여야 합니다')
  rejectUnknown(value, ['localStorage', 'sessionStorage', 'cookies'], 'seed')
  const seed: ScenarioSeed = {}
  if (value.localStorage !== undefined) seed.localStorage = parseStorage(value.localStorage, 'seed.localStorage')
  if (value.sessionStorage !== undefined) seed.sessionStorage = parseStorage(value.sessionStorage, 'seed.sessionStorage')
  if (value.cookies !== undefined) {
    if (!Array.isArray(value.cookies) || value.cookies.length > MAX_COOKIES) throw new Error(`seed.cookies: 배열이어야 하고 ${MAX_COOKIES}개 이하여야 합니다`)
    seed.cookies = value.cookies.map((cookie, index): NonNullable<ScenarioSeed['cookies']>[number] => {
      const where = `seed.cookies[${index}]`
      if (!isRecord(cookie)) throw new Error(`${where}: 객체여야 합니다`)
      rejectUnknown(cookie, ['name', 'value', 'path'], where)
      if (typeof cookie.value !== 'string') throw new Error(`${where}.value: 문자열이어야 합니다`)
      return { name: text(cookie.name, `${where}.name`, 100), value: cookie.value, ...(cookie.path !== undefined ? { path: text(cookie.path, `${where}.path`, 200) } : {}) }
    })
  }
  if (JSON.stringify(seed).length > MAX_SEED_BYTES) throw new Error(`seed: 전체 크기는 ${MAX_SEED_BYTES / 1024}KB 이하여야 합니다`)
  return seed
}

const parseStep = (value: unknown, index: number): ScenarioStep => {
  const where = `steps[${index}]`
  if (!isRecord(value)) throw new Error(`${where}: 객체여야 합니다`)
  const action = value.action
  if (action === 'click' || action === 'hover') {
    rejectUnknown(value, ['action', 'selector'], where)
    return { action, selector: text(value.selector, `${where}.selector`) }
  }
  if (action === 'fill') {
    rejectUnknown(value, ['action', 'selector', 'value'], where)
    if (typeof value.value !== 'string' || value.value.length > 10_000) throw new Error(`${where}.value: 10000자 이하의 문자열이어야 합니다`)
    return { action, selector: text(value.selector, `${where}.selector`), value: value.value }
  }
  if (action === 'wait') {
    rejectUnknown(value, ['action', 'ms', 'selector'], where)
    if ((value.ms === undefined) === (value.selector === undefined)) throw new Error(`${where}: ms 와 selector 중 하나만 지정해야 합니다`)
    if (value.ms !== undefined) {
      if (typeof value.ms !== 'number' || !Number.isFinite(value.ms) || value.ms < 0 || value.ms > MAX_WAIT_MS) throw new Error(`${where}.ms: 0~${MAX_WAIT_MS} 사이의 숫자여야 합니다`)
      return { action, ms: value.ms }
    }
    return { action, selector: text(value.selector, `${where}.selector`) }
  }
  throw new Error(`${where}.action: ${STEP_ACTIONS.map((name): string => `"${name}"`).join(', ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(action)})`)
}

export const MIN_TEXT_SCALE = 1.25
export const MAX_TEXT_SCALE = 3

const parseEnvironment = (value: unknown): ScenarioEnvironment => {
  if (!isRecord(value)) throw new Error('environment: 객체여야 합니다')
  rejectUnknown(value, ['colorScheme', 'forcedColors', 'textScale', 'longText', 'direction', 'device', 'engine'], 'environment')
  const environment: ScenarioEnvironment = {}
  if (value.colorScheme !== undefined) {
    if (value.colorScheme !== 'dark') throw new Error('environment.colorScheme: "dark" 만 지정할 수 있습니다')
    environment.colorScheme = 'dark'
  }
  if (value.forcedColors !== undefined) {
    if (typeof value.forcedColors !== 'boolean') throw new Error('environment.forcedColors: true/false 여야 합니다')
    if (value.forcedColors) environment.forcedColors = true
  }
  if (value.textScale !== undefined) {
    if (typeof value.textScale !== 'number' || !Number.isFinite(value.textScale) || value.textScale < MIN_TEXT_SCALE || value.textScale > MAX_TEXT_SCALE) {
      throw new Error(`environment.textScale: ${MIN_TEXT_SCALE}~${MAX_TEXT_SCALE} 사이의 숫자여야 합니다`)
    }
    environment.textScale = value.textScale
  }
  if (value.longText !== undefined) {
    if (typeof value.longText !== 'boolean') throw new Error('environment.longText: true/false 여야 합니다')
    if (value.longText) environment.longText = true
  }
  if (value.direction !== undefined) {
    if (value.direction !== 'rtl') throw new Error('environment.direction: "rtl" 만 지정할 수 있습니다')
    environment.direction = 'rtl'
  }
  if (value.device !== undefined) {
    if (typeof value.device !== 'string' || !(DEVICE_PROFILES as readonly string[]).includes(value.device)) {
      throw new Error(`environment.device: ${DEVICE_PROFILES.map((name): string => `"${name}"`).join(', ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(value.device)})`)
    }
    environment.device = value.device as ScenarioEnvironment['device']
  }
  if (value.engine !== undefined) {
    if (value.engine !== 'firefox' && value.engine !== 'webkit') throw new Error('environment.engine: "firefox" 또는 "webkit" 이어야 합니다(기본 Chromium 은 생략)')
    environment.engine = value.engine
  }
  if (Object.keys(environment).length === 0) throw new Error('environment: 적용할 항목이 하나 이상 있어야 합니다')
  return environment
}

export const parseScenario = (value: unknown): Scenario => {
  if (!isRecord(value)) throw new Error('시나리오는 JSON 객체여야 합니다')
  rejectUnknown(value, ['name', 'description', 'seed', 'steps', 'environment'], '시나리오')
  const scenario: Scenario = {}
  if (value.name !== undefined) scenario.name = text(value.name, 'name', 100)
  if (value.description !== undefined) scenario.description = text(value.description, 'description', 500)
  if (value.seed !== undefined) scenario.seed = parseSeed(value.seed)
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps) || value.steps.length > MAX_SCENARIO_STEPS) throw new Error(`steps: 배열이어야 하고 ${MAX_SCENARIO_STEPS}개 이하여야 합니다`)
    scenario.steps = value.steps.map(parseStep)
  }
  if (value.environment !== undefined) scenario.environment = parseEnvironment(value.environment)
  if (!scenario.seed && !scenario.steps?.length && !scenario.environment) throw new Error('시나리오에는 seed, steps, environment 중 하나 이상 있어야 합니다')
  return scenario
}

/** 키 순서와 상관없이 같은 내용이면 같은 문자열 */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key): string => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** 시나리오 내용의 짧은 키. name/description 은 표시용이라 내용에서 제외한다 */
// environment 는 있을 때만 키에 섞는다(없던 시절 시나리오의 키가 바뀌면 저장된 결함과 어긋난다)
export const scenarioKey = (scenario: Scenario): string => `s_${hashString(canonical({ seed: scenario.seed, steps: scenario.steps, ...(scenario.environment ? { environment: scenario.environment } : {}) }))}`

/** 같은 URL 이라도 시나리오가 다르면 다른 결함이므로 id 에 시나리오 키를 섞는다 */
export const qualifyDefectId = (id: string, key: string): string => `d_${hashString(`${id}|${key}`)}`

/** localStorage/sessionStorage 에 넣을 문자열. 문자열은 그대로, 그 밖은 JSON */
export const toStorageString = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value))
