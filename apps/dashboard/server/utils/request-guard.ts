/**
 * 대시보드 API 는 프로젝트 파일을 쓰므로, 같은 PC 의 다른 웹사이트가 부르지 못하게 막는다.
 * - Host 검사: 로컬 주소가 아니면 거부한다 (DNS 리바인딩: 공격자 도메인이 127.0.0.1 로 풀려도 Host 는 공격자 도메인이다)
 * - Origin 검사: 쓰기 요청의 Origin 이 같은 출처(대시보드 화면)나 Chrome 확장이 아니면 거부한다
 *   (본문 없는 단순 POST 는 CORS 사전 점검 없이 전송되므로 CORS 설정만으로는 막을 수 없다)
 * MCP 서버와 CLI 는 Node 의 fetch 라 Origin 이 없고, 그대로 통과한다.
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface GuardInput {
  method: string
  host: string | undefined
  origin: string | undefined
}

export type GuardResult = { allowed: true } | { allowed: false; reason: string }

const hostnameOf = (host: string): string => host.replace(/:\d+$/, '').toLowerCase()

/** INSPECTOR_ALLOWED_HOSTS(쉼표 구분)로 로컬 주소 밖에서 대시보드를 열 때 허용할 호스트 이름을 더한다 */
export const parseAllowedHosts = (value: string): string[] =>
  value
    .split(',')
    .map((name): string => name.trim().toLowerCase())
    .filter((name): boolean => name !== '')

export const checkApiRequest = (input: GuardInput, extraHosts: string[] = []): GuardResult => {
  if (!input.host || ![...LOOPBACK_HOSTS, ...extraHosts].includes(hostnameOf(input.host))) {
    return { allowed: false, reason: `허용되지 않은 호스트입니다: ${input.host ?? '없음'}. 다른 주소로 열려면 INSPECTOR_ALLOWED_HOSTS 에 추가하세요.` }
  }
  if (!WRITE_METHODS.has(input.method.toUpperCase()) || input.origin === undefined) return { allowed: true }

  if (input.origin.startsWith('chrome-extension://')) return { allowed: true }
  try {
    if (new URL(input.origin).host.toLowerCase() === input.host.toLowerCase()) return { allowed: true }
  } catch {
    // Origin: null 처럼 해석할 수 없는 값은 아래에서 거부한다
  }
  return { allowed: false, reason: `다른 출처(${input.origin})의 쓰기 요청은 허용되지 않습니다.` }
}
