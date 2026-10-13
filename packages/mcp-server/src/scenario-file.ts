import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * MCP scan_page 의 scenarioFile 인자 해석. 시나리오 JSON 의 검증은 대시보드가 한다(대시보드, CLI 와 같은 규칙).
 * 여기서는 .json 파일만 읽도록 제한해 도구 인자로 임의 파일 내용이 대시보드로 흘러가지 않게 한다.
 */
export const loadScenarioFile = async (path: string, cwd: string = process.cwd()): Promise<unknown> => {
  if (!path.toLowerCase().endsWith('.json')) throw new Error(`scenarioFile 은 .json 파일이어야 합니다: ${path}`)
  const absolute = resolve(cwd, path)
  let text: string
  try {
    text = await readFile(absolute, 'utf8')
  } catch {
    throw new Error(`시나리오 파일을 읽을 수 없습니다: ${absolute}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`시나리오 파일이 올바른 JSON 이 아닙니다 (${absolute}): ${error instanceof Error ? error.message : String(error)}`)
  }
}
