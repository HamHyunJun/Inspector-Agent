import { devices } from 'playwright-core'
import type { BrowserContextOptions } from 'playwright-core'
import { DEVICE_PROFILES } from '@inspector-agent/core'
import type { DeviceProfile, Scenario, ScenarioEnvironment, Viewport } from '@inspector-agent/core'

/**
 * 환경 변형 스캔: 같은 규칙을 다크 모드, 글자 확대, 긴 글, RTL, 고대비, 가로 모드, 실기기 프로필, 다른 엔진에서 다시 돌려
 * "그 환경에서만 생기는 결함"을 찾는다. 환경은 시나리오(environment)로 표현해 저장·재측정 경로를 그대로 쓴다.
 */

export const DEVICE_DESCRIPTORS: Record<DeviceProfile, string> = {
  'iphone-se': 'iPhone SE',
  iphone: 'iPhone 13',
  pixel: 'Pixel 7',
  galaxy: 'Galaxy S9+',
  ipad: 'iPad Mini'
}

export interface Variant {
  name: string
  /** 환경을 담은 시나리오. 가로 모드는 환경이 아니라 뷰포트를 바꾸는 것이라 없다 */
  scenario?: Scenario
  landscape?: boolean
}

const ENVIRONMENT_VARIANTS: Record<string, { name: string; environment: ScenarioEnvironment }> = {
  'text-scale': { name: '환경: 글자 크기 200%', environment: { textScale: 2 } },
  'long-text': { name: '환경: 긴 문구(1.5배)', environment: { longText: true } },
  dark: { name: '환경: 다크 모드', environment: { colorScheme: 'dark' } },
  rtl: { name: '환경: 오른쪽→왼쪽(RTL)', environment: { direction: 'rtl' } },
  'forced-colors': { name: '환경: 고대비(forced-colors)', environment: { forcedColors: true } }
}

/** `all` 이 뜻하는 변형. 장치와 다른 엔진은 따로 설치·선택해야 하므로 넣지 않는다 */
const ALL_VARIANTS = ['text-scale', 'long-text', 'dark', 'rtl', 'forced-colors', 'landscape']

export const VARIANT_NAMES = [...Object.keys(ENVIRONMENT_VARIANTS), 'landscape', ...DEVICE_PROFILES.map((name): string => `device:${name}`), 'engine:firefox', 'engine:webkit', 'all']

/** 쉼표로 구분한 이름(또는 배열)을 변형 목록으로 바꾼다. 알 수 없는 이름은 가능한 값을 알려 주며 거절한다 */
export const parseVariants = (value: string | string[] | undefined): Variant[] => {
  const names = (Array.isArray(value) ? value : (value ?? '').split(','))
    .map((name): string => name.trim())
    .filter((name): boolean => name !== '')
  const expanded = names.flatMap((name): string[] => (name === 'all' ? ALL_VARIANTS : [name]))
  return Array.from(new Set(expanded)).map((name): Variant => {
    const preset = ENVIRONMENT_VARIANTS[name]
    if (preset) return { name: preset.name, scenario: { name: preset.name, environment: preset.environment } }
    if (name === 'landscape') return { name: '환경: 가로 모드', landscape: true }
    const device = /^device:(.+)$/.exec(name)?.[1]
    if (device && (DEVICE_PROFILES as readonly string[]).includes(device)) {
      const label = `환경: ${DEVICE_DESCRIPTORS[device as DeviceProfile]}`
      return { name: label, scenario: { name: label, environment: { device: device as DeviceProfile } } }
    }
    const engine = /^engine:(firefox|webkit)$/.exec(name)?.[1]
    if (engine) {
      const label = `환경: ${engine} 엔진`
      return { name: label, scenario: { name: label, environment: { engine: engine as 'firefox' | 'webkit' } } }
    }
    throw new Error(`알 수 없는 환경 변형 "${name}". 사용 가능: ${VARIANT_NAMES.join(', ')}`)
  })
}

/** 환경 중 브라우저 컨텍스트 수준으로 만드는 것(색상 모드, 고대비, 장치). 글자 확대·긴 글·RTL 은 페이지 안에서 적용한다 */
export const contextOptionsFor = (environment: ScenarioEnvironment | undefined): BrowserContextOptions => {
  if (!environment) return {}
  const options: BrowserContextOptions = {}
  if (environment.device) Object.assign(options, devices[DEVICE_DESCRIPTORS[environment.device]])
  if (environment.colorScheme) options.colorScheme = environment.colorScheme
  if (environment.forcedColors) options.forcedColors = 'active'
  return options
}

/** 장치 프로필이 정한 뷰포트. 장치 변형은 주어진 뷰포트 대신 이 값을 쓴다 */
export const deviceViewport = (device: DeviceProfile): Viewport => {
  const viewport = devices[DEVICE_DESCRIPTORS[device]]?.viewport
  return viewport ? { width: viewport.width, height: viewport.height } : { width: 390, height: 844 }
}

/** 페이지 안에서 적용해야 하는 환경이 있는지 */
export const needsPageEnvironment = (environment: ScenarioEnvironment | undefined): boolean =>
  environment !== undefined && (environment.textScale !== undefined || environment.longText === true || environment.direction !== undefined)

/** 결함 지문에서 뷰포트 너비를 뺀 서명. 같은 결함이 다른 뷰포트에서 나와도 같은 것으로 본다 */
export const defectSignature = (fingerprint: string): string => fingerprint.replace(/\|\d+$/, '')
