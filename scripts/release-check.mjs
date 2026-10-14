// 배포 전 검증. 배포 대상 패키지의 메타데이터와 산출물이 npm 에 올릴 수 있는 상태인지 코드로 강제한다.
// 사용: node scripts/release-check.mjs [--tag v0.1.0]   (먼저 pnpm build 가 필요하다: bin, exports 가 가리키는 dist 를 확인한다)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SCOPE = '@inspector-agent/'
export const REPO_URL = 'git+https://github.com/HamHyunJun/Inspector-Agent.git'
export const PUBLISH_DIRS = ['core', 'vite-plugin', 'verifier', 'engine', 'mcp-server']
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

/** exports 객체에서 파일 경로 문자열을 모두 모은다 */
const exportTargets = (value) => {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets)
  return []
}

/**
 * 패키지 하나를 검사해 문제 목록(한국어)을 돌려준다. 파일 접근은 fs 로 주입받아 테스트할 수 있다.
 * fs: { exists(path): boolean, read(path): string }  (path 는 패키지 폴더 기준 상대 경로)
 */
export const checkPackage = ({ dir, pkg, fs, rootLicense, privateNames }) => {
  const problems = []
  const label = pkg.name ?? dir
  const need = (ok, message) => {
    if (!ok) problems.push(`${label}: ${message}`)
  }

  need(typeof pkg.name === 'string' && pkg.name.startsWith(SCOPE), `이름이 ${SCOPE} 로 시작해야 합니다`)
  need(pkg.private !== true, 'private 패키지는 배포할 수 없습니다')
  need(SEMVER.test(pkg.version ?? ''), `version 이 semver 가 아닙니다 (${pkg.version})`)
  need(typeof pkg.description === 'string' && pkg.description.trim() !== '', 'description 이 없습니다')
  need(pkg.license === 'MIT', 'license 는 MIT 여야 합니다')
  need(pkg.repository?.url === REPO_URL && pkg.repository?.directory === `packages/${dir}`, `repository 가 ${REPO_URL} 와 directory packages/${dir} 이어야 합니다`)
  need(typeof pkg.homepage === 'string' && typeof pkg.bugs?.url === 'string', 'homepage 와 bugs.url 이 필요합니다')
  need(Array.isArray(pkg.keywords) && pkg.keywords.length > 0, 'keywords 가 없습니다')
  need(typeof pkg.engines?.node === 'string', 'engines.node 가 없습니다')
  need(pkg.publishConfig?.access === 'public', 'publishConfig.access 는 public 이어야 합니다(스코프 패키지는 기본이 비공개)')
  need(Array.isArray(pkg.files) && pkg.files.includes('dist'), 'files 에 dist 가 있어야 합니다(소스와 테스트가 tarball 에 들어가면 안 됩니다)')

  const bins = Object.values(pkg.bin ?? {})
  const targets = [pkg.main, pkg.types, ...exportTargets(pkg.exports), ...bins].filter(Boolean)
  need(targets.length > 0, 'main, exports, bin 중 하나는 있어야 합니다')
  for (const target of new Set(targets)) need(fs.exists(target), `${target} 가 없습니다 (pnpm build 를 먼저 실행하세요)`)
  for (const bin of bins) {
    if (fs.exists(bin)) need(fs.read(bin).startsWith('#!'), `bin ${bin} 첫 줄이 shebang(#!/usr/bin/env node)이 아닙니다`)
  }

  need(fs.exists('README.md') && fs.read('README.md').trim().length >= 100, 'README.md 가 없거나 너무 짧습니다')
  need(fs.exists('LICENSE') && fs.read('LICENSE') === rootLicense, 'LICENSE 가 없거나 루트 LICENSE 와 다릅니다 (cp LICENSE packages/<이름>/LICENSE)')

  for (const [dependency, range] of Object.entries(pkg.dependencies ?? {})) {
    if (!dependency.startsWith(SCOPE)) continue
    need(range === 'workspace:^', `${dependency} 는 workspace:^ 로 의존해야 합니다(pack 때 ^버전으로 바뀝니다). 현재 ${range}`)
    need(!privateNames.has(dependency), `비공개 패키지 ${dependency} 에 의존합니다. 배포하면 설치할 수 없습니다`)
  }
  return problems
}

/** 배포 대상 버전은 항상 같아야 하고(fixed 그룹), 태그가 있으면 v<버전> 과 같아야 한다 */
export const checkVersions = (packages, tag) => {
  const problems = []
  const versions = new Set(packages.map((pkg) => pkg.version))
  if (versions.size > 1) problems.push(`배포 대상 버전이 서로 다릅니다: ${packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')}`)
  if (tag !== undefined && versions.size === 1 && tag !== `v${[...versions][0]}`) problems.push(`태그 ${tag} 가 패키지 버전 v${[...versions][0]} 과 다릅니다`)
  return problems
}

const main = () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const tagIndex = process.argv.indexOf('--tag')
  const tag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1]
  const rootLicense = readFileSync(join(root, 'LICENSE'), 'utf8')

  const allPackages = readdirSync(join(root, 'packages'))
    .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
    .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) }))
  const privateNames = new Set(allPackages.filter(({ pkg }) => pkg.private).map(({ pkg }) => pkg.name))

  const problems = []
  const publishable = PUBLISH_DIRS.map((dir) => allPackages.find((entry) => entry.dir === dir))
  for (const [index, entry] of publishable.entries()) {
    if (!entry) {
      problems.push(`packages/${PUBLISH_DIRS[index]} 가 없습니다`)
      continue
    }
    const base = join(root, 'packages', entry.dir)
    const fs = { exists: (path) => existsSync(join(base, path)), read: (path) => readFileSync(join(base, path), 'utf8') }
    problems.push(...checkPackage({ dir: entry.dir, pkg: entry.pkg, fs, rootLicense, privateNames }))
  }
  problems.push(...checkVersions(publishable.filter(Boolean).map((entry) => entry.pkg), tag))

  if (problems.length > 0) {
    console.error(`배포 전 검증 실패 ${problems.length}건:\n${problems.map((problem) => `- ${problem}`).join('\n')}`)
    process.exitCode = 1
    return
  }
  console.log(`배포 전 검증 통과: ${publishable.map((entry) => `${entry?.pkg.name}@${entry?.pkg.version}`).join(', ')}${tag ? ` (태그 ${tag})` : ''}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
