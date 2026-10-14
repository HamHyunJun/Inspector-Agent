/** HTTP 상태 코드를 함께 가진 오류. 대시보드는 이 코드로 응답하고, MCP·CLI 는 메시지만 쓴다 */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'EngineError'
  }
}
