import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getInspectorConfig } from './config'

/**
 * 대상 프로젝트 파일 접근. 모든 경로는 projectRoot 안으로 제한한다
 * (에이전트가 넘긴 경로로 루트 밖 파일을 덮어쓰는 것을 막는다).
 */
export const resolveProjectPath = (file: string): string => {
  const { projectRoot } = getInspectorConfig()
  const absolute = resolve(projectRoot, file)
  const fromRoot = relative(projectRoot, absolute)
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw createError({ statusCode: 400, statusMessage: `프로젝트 루트 밖의 경로입니다: ${file}` })
  }
  if (fromRoot.split(/[\\/]/).includes('node_modules')) {
    throw createError({ statusCode: 400, statusMessage: 'node_modules 안의 파일은 수정할 수 없습니다.' })
  }
  return absolute
}

export const readProjectFile = async (file: string): Promise<string> => {
  try {
    return await readFile(resolveProjectPath(file), 'utf8')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    throw createError({ statusCode: 404, statusMessage: `파일을 읽을 수 없습니다: ${file}` })
  }
}

export const writeProjectFile = async (file: string, content: string): Promise<void> => {
  await writeFile(resolveProjectPath(file), content, 'utf8')
}

export const hashContent = (content: string): string => createHash('sha256').update(content).digest('hex')

const backupPath = (patchId: string): string => join(getInspectorConfig().dataDir, 'backups', `${patchId}.bak`)

export const backupProjectFile = async (file: string, patchId: string): Promise<void> => {
  const target = backupPath(patchId)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolveProjectPath(file), target)
}

export const restoreProjectFile = async (file: string, patchId: string): Promise<void> => {
  await copyFile(backupPath(patchId), resolveProjectPath(file))
}
