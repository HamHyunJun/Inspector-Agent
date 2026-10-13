import { checkApiRequest, parseAllowedHosts } from '../utils/request-guard'

export default defineEventHandler((event): void => {
  if (!event.path.startsWith('/api/')) return
  const result = checkApiRequest(
    { method: event.method, host: getRequestHeader(event, 'host'), origin: getRequestHeader(event, 'origin') },
    parseAllowedHosts(String(useRuntimeConfig(event).allowedHosts))
  )
  if (!result.allowed) throw createError({ statusCode: 403, statusMessage: result.reason })
})
