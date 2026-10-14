import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMAND_NAMES, installCommands, readCommandSource, toPromptText } from '../src/commands'

describe('toPromptText', () => {
  it('프런트매터를 걷어 내고 $ARGUMENTS 를 실제 인자로 바꿔 에이전트에게 전달한다', async () => {
    const text = toPromptText(await readCommandSource(), 'scan http://localhost:5173')
    expect(text).not.toContain('allowed-tools')
    expect(text).not.toContain('$ARGUMENTS')
    expect(text.startsWith('인자: `scan http://localhost:5173`')).toBe(true)
  })
})

describe('toPromptText 특수 문자', () => {
  it('인자에 $& 같은 치환 패턴이 있어도 그대로 전달한다', async (): Promise<void> => {
    expect(toPromptText(await readCommandSource(), 'scan http://a?b=$&c')).toContain('`scan http://a?b=$&c`')
  })
})

describe('installCommands', () => {
  it('ia, insp 를 같은 내용으로 설치하고, 다시 실행하면 건드리지 않는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ia-commands-'))
    const first = await installCommands({ dir })
    expect(first.written).toHaveLength(COMMAND_NAMES.length)
    expect(await readFile(join(dir, 'insp.md'), 'utf8')).toBe(await readFile(join(dir, 'ia.md'), 'utf8'))
    const second = await installCommands({ dir })
    expect(second).toMatchObject({ written: [], skipped: [] })
    expect(second.unchanged).toHaveLength(COMMAND_NAMES.length)
  })

  it('내용이 다른 기존 파일은 --force 없이는 덮어쓰지 않는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ia-commands-'))
    await writeFile(join(dir, 'ia.md'), '내가 만든 명령', 'utf8')
    const result = await installCommands({ dir })
    expect(result.skipped).toEqual([join(dir, 'ia.md')])
    expect(await readFile(join(dir, 'ia.md'), 'utf8')).toBe('내가 만든 명령')
    await installCommands({ dir, force: true })
    expect(await readFile(join(dir, 'ia.md'), 'utf8')).toBe(await readCommandSource())
  })
})
