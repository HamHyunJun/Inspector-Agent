import { mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadScenarioFile } from '../src/scenario-file'

describe('loadScenarioFile', () => {
  it('cwd 기준 상대 경로의 JSON 파일을 읽는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ia-scenario-'))
    await writeFile(join(dir, 'a.json'), '{"steps":[{"action":"click","selector":"b"}]}')
    expect(await loadScenarioFile('a.json', dir)).toEqual({ steps: [{ action: 'click', selector: 'b' }] })
  })

  it('작업 폴더 밖의 JSON(절대 경로, 상위 경로, 밖을 가리키는 심볼릭 링크)은 읽지 않는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ia-scenario-'))
    const outside = await mkdtemp(join(tmpdir(), 'ia-outside-'))
    await writeFile(join(outside, 'secret.json'), '{"client_secret":"x"}')
    await symlink(join(outside, 'secret.json'), join(dir, 'link.json'))
    await expect(loadScenarioFile(join(outside, 'secret.json'), dir)).rejects.toThrow('읽을 수 없습니다')
    await expect(loadScenarioFile(`../${outside.split('/').pop()}/secret.json`, dir)).rejects.toThrow('읽을 수 없습니다')
    await expect(loadScenarioFile('link.json', dir)).rejects.toThrow('읽을 수 없습니다')
  })

  it('.json 이 아니면 읽지 않는다', async () => {
    await expect(loadScenarioFile('/etc/passwd')).rejects.toThrow('.json 파일')
    await expect(loadScenarioFile('notes.txt')).rejects.toThrow('.json 파일')
  })

  it('없는 파일과 깨진 JSON 은 경로를 담은 오류로 알린다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ia-scenario-'))
    await writeFile(join(dir, 'broken.json'), '{ nope')
    await expect(loadScenarioFile('missing.json', dir)).rejects.toThrow('읽을 수 없습니다')
    await expect(loadScenarioFile('broken.json', dir)).rejects.toThrow('올바른 JSON')
  })
})
