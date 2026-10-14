import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { EngineConfig } from './config'
import { EngineError } from './errors'
import { assertPatchId } from './ids'

/**
 * 대상 프로젝트 파일 접근. 모든 경로는 projectRoot 안으로 제한한다
 * (에이전트가 넘긴 경로로 루트 밖 파일을 덮어쓰는 것을 막는다).
 */
export const hashContent = (content: string): string => createHash('sha256').update(content).digest('hex')

/** 이 도구가 고치는 것은 화면 코드(컴포넌트, 스타일)뿐이다. 설정·비밀 파일(.env, vite.config, .git)은 읽지도 쓰지도 않는다 */
const PATCHABLE_FILE = /\.(vue|css|scss|sass|less|jsx|tsx|svelte|astro|html)$/i

export interface ProjectFiles {
  read: (file: string) => Promise<string>
  write: (file: string, content: string) => Promise<void>
  backup: (file: string, patchId: string) => Promise<void>
  restore: (file: string, patchId: string) => Promise<void>
  /** 패치 기록을 지울 때 원복용 백업도 함께 지운다. 없으면 조용히 넘어간다 */
  removeBackup: (patchId: string) => Promise<void>
}

export const createProjectFiles = ({ projectRoot, dataDir }: Pick<EngineConfig, 'projectRoot' | 'dataDir'>): ProjectFiles => {
  const resolvePath = (file: string): string => {
    const absolute = resolve(projectRoot, file)
    const fromRoot = relative(projectRoot, absolute)
    if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new EngineError(`프로젝트 루트 밖의 경로입니다: ${file}`, 400)
    }
    const parts = fromRoot.split(/[\\/]/)
    if (parts.includes('node_modules')) throw new EngineError('node_modules 안의 파일은 수정할 수 없습니다.', 400)
    if (parts.some((part): boolean => part.startsWith('.'))) throw new EngineError(`숨김 경로(.env, .git, .inspector-agent 등)는 다루지 않습니다: ${file}`, 400)
    const fromData = relative(dataDir, absolute)
    if (!fromData.startsWith('..') && !isAbsolute(fromData)) throw new EngineError(`데이터 폴더 안의 파일은 다루지 않습니다: ${file}`, 400)
    if (!PATCHABLE_FILE.test(absolute)) throw new EngineError(`화면 코드(.vue .css .scss .jsx .tsx 등)만 다룰 수 있습니다: ${file}`, 400)
    return absolute
  }

  const backupPath = (patchId: string): string => {
    assertPatchId(patchId)
    return join(dataDir, 'backups', `${patchId}.bak`)
  }

  /** 루트 안에 있는 것처럼 보여도 심볼릭 링크가 루트 밖 파일을 가리키면 거부한다. 파일은 이미 있어야 한다 */
  const safePath = async (file: string): Promise<string> => {
    const absolute = resolvePath(file)
    const [real, realRoot] = await Promise.all([realpath(absolute), realpath(projectRoot)]).catch((): never => {
      throw new EngineError(`파일을 읽을 수 없습니다: ${file}`, 404)
    })
    if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new EngineError(`심볼릭 링크가 프로젝트 루트 밖을 가리킵니다: ${file}`, 400)
    // 심볼릭 링크가 숨김 경로나 node_modules, 화면 코드가 아닌 파일로 이어지는 경우도 같은 규칙으로 거부한다
    resolvePath(relative(realRoot, real))
    return real
  }

  return {
    read: async (file): Promise<string> => readFile(await safePath(file), 'utf8'),
    write: async (file, content): Promise<void> => writeFile(await safePath(file), content, 'utf8'),
    backup: async (file, patchId): Promise<void> => {
      const source = await safePath(file)
      const target = backupPath(patchId)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(source, target)
    },
    restore: async (file, patchId): Promise<void> => copyFile(backupPath(patchId), await safePath(file)),
    removeBackup: (patchId): Promise<void> => rm(backupPath(patchId), { force: true })
  }
}
