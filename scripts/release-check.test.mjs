import { describe, expect, it } from 'vitest'
import { REPO_URL, checkPackage, checkVersions } from './release-check.mjs'

const LICENSE = 'MIT License\n...'
const goodPackage = () => ({
  name: '@inspector-agent/verifier',
  version: '0.1.0',
  description: '검증기',
  license: 'MIT',
  repository: { type: 'git', url: REPO_URL, directory: 'packages/verifier' },
  homepage: 'https://example.com',
  bugs: { url: 'https://example.com/issues' },
  keywords: ['layout'],
  engines: { node: '>=20' },
  publishConfig: { access: 'public' },
  files: ['dist'],
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  bin: { 'inspector-scan': './dist/cli.js' },
  dependencies: { '@inspector-agent/core': 'workspace:^', 'playwright-core': '1.56.1' }
})

const goodFs = (overrides = {}) => {
  const files = {
    './dist/index.js': 'export {}',
    './dist/index.d.ts': 'export {}',
    './dist/cli.js': '#!/usr/bin/env node\nconsole.log(1)',
    'README.md': 'x'.repeat(200),
    LICENSE,
    ...overrides
  }
  return { exists: (path) => path in files && files[path] !== undefined, read: (path) => files[path] ?? '' }
}

const run = (pkg = goodPackage(), fs = goodFs(), privateNames = new Set()) => checkPackage({ dir: 'verifier', pkg, fs, rootLicense: LICENSE, privateNames })

describe('checkPackage', () => {
  it('모든 조건을 갖추면 문제가 없다', () => {
    expect(run()).toEqual([])
  })

  it.each([
    ['스코프가 다른 이름', { name: 'other/verifier' }, '시작해야'],
    ['private', { private: true }, 'private'],
    ['semver 아님', { version: 'one' }, 'semver'],
    ['라이선스 누락', { license: undefined }, 'MIT'],
    ['repository directory 불일치', { repository: { type: 'git', url: REPO_URL, directory: 'packages/core' } }, 'repository'],
    ['keywords 없음', { keywords: [] }, 'keywords'],
    ['engines 없음', { engines: undefined }, 'engines'],
    ['공개 접근 누락(스코프 패키지는 기본 비공개)', { publishConfig: {} }, 'access'],
    ['files 에 dist 없음(소스가 tarball 에 들어감)', { files: ['src'] }, 'dist'],
    ['workspace:* 의존(pack 후 정확한 버전으로 고정됨)', { dependencies: { '@inspector-agent/core': 'workspace:*' } }, 'workspace:^']
  ])('%s', (_name, overrides, message) => {
    const problems = run({ ...goodPackage(), ...overrides })
    expect(problems.join('\n')).toContain(message)
  })

  it('bin, exports 가 가리키는 파일이 없으면 build 를 안내한다', () => {
    const problems = run(goodPackage(), goodFs({ './dist/cli.js': undefined }))
    expect(problems.join('\n')).toContain('./dist/cli.js 가 없습니다')
    expect(problems.join('\n')).toContain('pnpm build')
  })

  it('bin 파일에 shebang 이 없으면 알린다', () => {
    expect(run(goodPackage(), goodFs({ './dist/cli.js': 'console.log(1)' })).join('\n')).toContain('shebang')
  })

  it('README 나 LICENSE 가 없거나 루트 LICENSE 와 다르면 알린다', () => {
    expect(run(goodPackage(), goodFs({ 'README.md': undefined })).join('\n')).toContain('README.md')
    expect(run(goodPackage(), goodFs({ LICENSE: 'GPL' })).join('\n')).toContain('LICENSE')
    expect(run(goodPackage(), goodFs({ LICENSE: undefined })).join('\n')).toContain('LICENSE')
  })

  it('비공개 패키지에 의존하면 설치할 수 없으므로 알린다', () => {
    const pkg = { ...goodPackage(), dependencies: { '@inspector-agent/source-locator': 'workspace:^' } }
    expect(run(pkg, goodFs(), new Set(['@inspector-agent/source-locator'])).join('\n')).toContain('비공개 패키지')
  })
})

describe('checkVersions', () => {
  const pkgs = (...versions) => versions.map((version, index) => ({ name: `@inspector-agent/p${index}`, version }))

  it('버전이 모두 같고 태그가 v<버전> 이면 통과한다', () => {
    expect(checkVersions(pkgs('0.1.0', '0.1.0'), 'v0.1.0')).toEqual([])
    expect(checkVersions(pkgs('0.1.0', '0.1.0'))).toEqual([])
  })

  it('버전이 다르거나 태그가 어긋나면 알린다', () => {
    expect(checkVersions(pkgs('0.1.0', '0.2.0'))[0]).toContain('서로 다릅니다')
    expect(checkVersions(pkgs('0.1.0'), 'v0.2.0')[0]).toContain('태그 v0.2.0')
    expect(checkVersions(pkgs('0.1.0'), '0.1.0')[0]).toContain('태그 0.1.0')
  })
})
