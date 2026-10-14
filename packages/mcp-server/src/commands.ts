import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * `/ia scan` 슬래시 명령의 원본(commands/ia.md)을 두 곳에서 같이 쓴다.
 * - MCP 프롬프트: 서버가 직접 노출해 설치 없이 `/mcp__inspector-agent__scan` 으로 쓴다
 * - install-commands: 짧은 `/ia`, `/insp` 를 쓰도록 ~/.claude/commands 에 파일로 복사한다
 */

/** 설치할 짧은 이름들. 같은 내용을 이 이름으로 각각 복사한다 */
export const COMMAND_NAMES = ['ia', 'insp'] as const

const SOURCE = new URL('../commands/ia.md', import.meta.url)

export const readCommandSource = (): Promise<string> => readFile(SOURCE, 'utf8')

/** MCP 프롬프트 본문: 프런트매터를 걷어 내고 $ARGUMENTS 를 실제 인자로 바꾼다(인자 줄은 남겨야 에이전트가 인자를 안다) */
export const toPromptText = (source: string, args: string): string =>
  source
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replaceAll('$ARGUMENTS', args)
    .trim()

export interface InstallOptions {
  /** 명령 파일을 넣을 폴더. 기본은 ~/.claude/commands */
  dir?: string
  /** 같은 이름의 다른 내용 파일을 덮어쓴다 */
  force?: boolean
}

export interface InstallResult {
  dir: string
  written: string[]
  unchanged: string[]
  /** 내용이 달라서 건드리지 않은 파일. --force 로 덮어쓴다 */
  skipped: string[]
}

export const installCommands = async (options: InstallOptions = {}): Promise<InstallResult> => {
  const dir = options.dir ?? join(homedir(), '.claude', 'commands')
  const source = await readCommandSource()
  const result: InstallResult = { dir, written: [], unchanged: [], skipped: [] }
  await mkdir(dir, { recursive: true })
  for (const name of COMMAND_NAMES) {
    const file = join(dir, `${name}.md`)
    const existing = await readFile(file, 'utf8').catch((): undefined => undefined)
    if (existing === source) result.unchanged.push(file)
    else if (existing !== undefined && !options.force) result.skipped.push(file)
    else {
      await writeFile(file, source, 'utf8')
      result.written.push(file)
    }
  }
  return result
}

/** install-commands 서브커맨드의 인자 해석과 출력. 종료 코드를 돌려준다 */
export const runInstallCommands = async (args: string[]): Promise<number> => {
  const force = args.includes('--force')
  const dir = args.includes('--project') ? join(process.cwd(), '.claude', 'commands') : undefined
  const result = await installCommands({ dir, force })
  for (const file of result.written) console.log(`설치: ${file}`)
  for (const file of result.unchanged) console.log(`이미 최신: ${file}`)
  for (const file of result.skipped) console.log(`건너뜀(다른 내용의 파일이 있음, 덮어쓰려면 --force): ${file}`)
  if (result.written.length + result.unchanged.length > 0) console.log('\nClaude Code 를 새 세션으로 열고 /ia scan 을 실행하세요.')
  return result.skipped.length > 0 ? 1 : 0
}
