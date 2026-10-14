import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * MCP scan_page 의 scenarioFile 인자 해석. 시나리오 JSON 의 검증은 대시보드가 한다(대시보드, CLI 와 같은 규칙).
 * 여기서는 작업 폴더 안의 .json 파일만 읽도록 제한해(심볼릭 링크 포함) 도구 인자로 홈 폴더의 설정·자격 증명 파일을
 * 읽거나 그 내용이 오류 메시지로 새지 않게 한다.
 */
export const loadScenarioFile = async (path: string, cwd: string = process.cwd()): Promise<unknown> => {
  if (!path.toLowerCase().endsWith('.json')) throw new Error(`scenarioFile 은 .json 파일이어야 합니다: ${path}`)
  const absolute = resolve(cwd, path)
  let text: string
  try {
    const [real, realCwd] = await Promise.all([realpath(absolute), realpath(cwd)])
    if (!real.startsWith(realCwd + sep)) throw new Error('작업 폴더 밖')
    text = await readFile(real, 'utf8')
  } catch {
    throw new Error(`시나리오 파일을 읽을 수 없습니다(작업 폴더 안의 .json 만 읽습니다): ${absolute}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`시나리오 파일이 올바른 JSON 이 아닙니다 (${absolute}): ${error instanceof Error ? error.message : String(error)}`)
  }
}
