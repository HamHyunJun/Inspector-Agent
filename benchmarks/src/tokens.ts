import Anthropic from '@anthropic-ai/sdk'
import { estimateTokens } from '@inspector-agent/core'

/**
 * 벤치마크 토큰 계측.
 * 기본은 Anthropic count_tokens API(실제 토크나이저)이고, 키가 없는 환경에서만 INSPECTOR_BENCH_ESTIMATE=1 로
 * 4자당 1토큰 근사를 명시적으로 켠다. 두 방식의 수치는 섞어 비교하지 않으며, 결과 파일에 method 를 남긴다.
 */

/** 토큰 수는 모델별로 다르다. 에이전트가 쓰는 모델에 맞춰 INSPECTOR_TOKEN_MODEL 로 바꿀 수 있다 */
export const DEFAULT_TOKEN_MODEL = 'claude-opus-5-5'

export interface TokenCounter {
  method: 'api' | 'estimate'
  model?: string
  count: (text: string) => Promise<number>
}

export interface CountTokensClient {
  messages: { countTokens: (params: { model: string; messages: Array<{ role: 'user'; content: string }> }) => Promise<{ input_tokens: number }> }
}

export const createTokenCounter = async (
  options: { client?: CountTokensClient; model?: string; estimate?: boolean } = {}
): Promise<TokenCounter> => {
  if (options.estimate ?? process.env.INSPECTOR_BENCH_ESTIMATE === '1') {
    return { method: 'estimate', count: async (text): Promise<number> => estimateTokens(text) }
  }
  const model = options.model ?? process.env.INSPECTOR_TOKEN_MODEL ?? DEFAULT_TOKEN_MODEL
  const client = options.client ?? new Anthropic()
  // count_tokens 는 빈 본문을 거부하므로 한 글자라도 담아 보낸다
  const count = async (text: string): Promise<number> =>
    (await client.messages.countTokens({ model, messages: [{ role: 'user', content: text === '' ? ' ' : text }] })).input_tokens

  // 측정을 시작하기 전에 자격 증명을 확인해, 브라우저와 서버를 띄운 뒤에야 실패하는 일을 막는다
  try {
    await count('ping')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `토큰 계측 API(${model}) 호출에 실패했습니다: ${reason}\n` +
        'ANTHROPIC_API_KEY 를 설정하거나 `ant auth login` 으로 로그인하세요. API 없이 근사치로 돌리려면 INSPECTOR_BENCH_ESTIMATE=1 을 지정하세요(결과에 method: estimate 로 표시됩니다).'
    )
  }
  return { method: 'api', model, count }
}
