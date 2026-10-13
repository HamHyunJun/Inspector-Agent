import { cp, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 앱을 임시 디렉터리에 복사한다 (원본은 건드리지 않는다). 벤치마크와 데모 녹화가 같이 쓴다 */
export const preparePlayground = async (playgroundRoot: string): Promise<string> => {
  // macOS 의 /var → /private/var 심볼릭 링크 때문에 Vite 모듈 id 와 root 의 상대 경로가 어긋나지 않도록 실제 경로를 쓴다
  const workdir = await realpath(await mkdtemp(join(tmpdir(), 'inspector-bench-')))
  await cp(playgroundRoot, workdir, {
    recursive: true,
    filter: (source): boolean => !source.includes('node_modules') && !source.includes('/dist')
  })
  await symlink(join(playgroundRoot, 'node_modules'), join(workdir, 'node_modules'), 'dir')
  // 복사본 위치에서는 모노레포 tsconfig.base.json 상속 경로가 깨지므로 독립 tsconfig 로 바꾼다
  const base = JSON.parse(await readFile(join(repoRoot, 'tsconfig.base.json'), 'utf8')) as { compilerOptions: object }
  const own = JSON.parse(await readFile(join(playgroundRoot, 'tsconfig.json'), 'utf8')) as { compilerOptions: object; include: string[] }
  await writeFile(
    join(workdir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { ...base.compilerOptions, ...own.compilerOptions }, include: own.include })
  )
  return workdir
}
