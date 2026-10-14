import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseScenario } from '@inspector-agent/core'
import { PLAYGROUND_SCENARIO } from './fixtures'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../docs/scenarios')

describe('docs/scenarios 예시', () => {
  it('모든 예시 JSON 이 시나리오 검증을 통과한다 (문서가 실제 형식과 어긋나지 않는다)', async () => {
    const files = (await readdir(dir)).filter((name): boolean => name.endsWith('.json'))
    expect(files.length).toBeGreaterThanOrEqual(2)
    for (const file of files) {
      const json: unknown = JSON.parse(await readFile(join(dir, file), 'utf8'))
      expect(() => parseScenario(json), file).not.toThrow()
    }
  })

  it('벤치마크 시나리오도 검증을 통과한다', () => {
    expect(() => parseScenario(PLAYGROUND_SCENARIO)).not.toThrow()
  })
})
