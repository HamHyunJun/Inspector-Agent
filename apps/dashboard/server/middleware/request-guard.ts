import { checkApiRequest, parseAllowedHosts } from '../utils/request-guard'

export default defineEventHandler((event): void => {
  // 경로 정규화 우회를 막으려고 쓰기 메서드는 경로와 관계없이 검사한다
  if (!event.path.toLowerCase().startsWith('/api/') && !['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method.toUpperCase())) return
  const result = checkApiRequest(
    { method: event.method, host: getRequestHeader(event, 'host'), origin: getRequestHeader(event, 'origin') },
    parseAllowedHosts(String(useRuntimeConfig(event).allowedHosts))
  )
  if (!result.allowed) throw createError({ statusCode: 403, statusMessage: result.reason })
})
