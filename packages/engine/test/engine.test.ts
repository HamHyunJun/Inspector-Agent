import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Defect, NodeSnapshot, ScanResult } from '@inspector-agent/core'
import { createEngine, projectRootProblem, resolveConfig } from '../src'
import type { Engine } from '../src'

/**
 * 안전장치(경로 제한, 충돌 거부, 재측정 실패 시 자동 롤백)를 가짜 측정기로 검사한다.
 * 브라우저 없이 파일과 저장소 동작만 본다.
 */

const ORIGINAL = '.box { width: 300px; }\n'
const EDIT = { oldText: 'width: 300px;', newText: 'width: 100%;' }

const snapshot = (): NodeSnapshot => ({
  selector: 'div.box',
  tag: 'div',
  classes: ['box'],
  rect: { x: 0, y: 0, width: 300, height: 10, right: 300, bottom: 10 },
  scrollWidth: 300,
  clientWidth: 300,
  styles: {},
  childElementCount: 0,
  childClasses: []
})

const defect: Defect = {
  id: 'd_1',
  fingerprint: 'f_1',
  kind: 'overflow-x',
  severity: 'high',
  url: 'http://localhost:5173/',
  viewport: { width: 375, height: 812 },
  node: snapshot(),
  parent: snapshot(),
  metrics: { kind: 'overflow-x', mode: 'box', overflowPx: 40, overflowRatio: 0.1, parentContentWidth: 300, nodeWidth: 340 },
  suggestions: [],
  detectedAt: ''
}

const scanResult: ScanResult = { url: defect.url, viewport: defect.viewport, documentOverflowPx: 0, defects: [defect], stats: { scannedNodes: 1, durationMs: 1 } }

const verification = (passed: boolean) => ({ passed, verdict: passed ? '통과' : '남아 있음', stillPresent: !passed, unit: 'px' as const, beforePx: 40, afterPx: passed ? 0 : 40, regressions: [], documentOverflowPx: 0, measuredAt: '' })

let root: string
let dataDir: string
let engine: Engine
let measure: ReturnType<typeof vi.fn>

beforeEach(async (): Promise<void> => {
  const base = await mkdtemp(join(tmpdir(), 'ia-engine-'))
  root = join(base, 'project')
  dataDir = join(base, 'data')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src/A.css'), ORIGINAL, 'utf8')
  measure = vi.fn(async () => verification(true))
  engine = createEngine(resolveConfig({ projectRoot: root, dataDir, settleMs: 0 }), { measure: measure as never })
  await engine.ingest([scanResult])
})

const file = (): Promise<string> => readFile(join(root, 'src/A.css'), 'utf8')
const propose = (overrides: { file?: string } = {}) => engine.proposePatch({ defectId: 'd_1', file: overrides.file ?? 'src/A.css', edits: [EDIT], rationale: 'r' })

describe('경로 안전장치', () => {
  it.each([
    ['루트 밖(상위 경로)', '../outside.css'],
    ['절대 경로', '/etc/hosts'],
    ['node_modules 안', 'node_modules/pkg/index.css']
  ])('%s 는 제안 단계에서 거부한다', async (_name, path): Promise<void> => {
    await expect(propose({ file: path })).rejects.toMatchObject({ status: expect.any(Number) })
    expect(await engine.listPatches()).toEqual([])
  })

  it('루트 안의 심볼릭 링크가 루트 밖 파일을 가리키면 거부하고 그 파일을 건드리지 않는다', async (): Promise<void> => {
    const outside = join(root, '..', 'secret.css')
    await writeFile(outside, '.box { width: 300px; }\n', 'utf8')
    await symlink(outside, join(root, 'src/link.css'))
    await expect(propose({ file: 'src/link.css' })).rejects.toMatchObject({ status: 400 })
    expect(await readFile(outside, 'utf8')).toBe('.box { width: 300px; }\n')
  })
})

describe('제안 → 적용 → 재측정', () => {
  it('제안은 파일을 바꾸지 않고 diff 만 만든다', async (): Promise<void> => {
    const patch = await propose()
    expect(patch.status).toBe('proposed')
    expect(patch.diff).toContain('+.box { width: 100%; }')
    expect(await file()).toBe(ORIGINAL)
  })

  it('재측정을 통과하면 파일이 바뀌고 결함은 resolved 가 된다', async (): Promise<void> => {
    const patch = await propose()
    const applied = await engine.applyPatch(patch.id)
    expect(applied.status).toBe('verified')
    expect(await file()).toContain('width: 100%')
    expect((await engine.listDefects())[0]?.status).toBe('resolved')
  })

  it('재측정에 실패하면 원본으로 자동 롤백하고 결함은 open 으로 남는다', async (): Promise<void> => {
    measure.mockResolvedValueOnce(verification(false))
    const applied = await engine.applyPatch((await propose()).id)
    expect(applied).toMatchObject({ status: 'failed', autoRolledBack: true })
    expect(await file()).toBe(ORIGINAL)
    expect((await engine.listDefects())[0]?.status).toBe('open')
  })

  it('측정 자체가 예외로 실패해도 원본으로 되돌린다', async (): Promise<void> => {
    measure.mockRejectedValueOnce(new Error('브라우저 실행 실패'))
    const applied = await engine.applyPatch((await propose()).id)
    expect(applied).toMatchObject({ status: 'failed', autoRolledBack: true })
    expect(applied.error).toContain('브라우저 실행 실패')
    expect(await file()).toBe(ORIGINAL)
  })

  it('제안 이후 파일이 바뀌었으면 적용을 거부하고 사용자의 변경을 덮어쓰지 않는다', async (): Promise<void> => {
    const patch = await propose()
    await writeFile(join(root, 'src/A.css'), '.box { width: 301px; } /* 내가 고침 */\n', 'utf8')
    await expect(engine.applyPatch(patch.id)).rejects.toMatchObject({ status: 409 })
    expect(await file()).toBe('.box { width: 301px; } /* 내가 고침 */\n')
    expect(measure).not.toHaveBeenCalled()
  })

  it('저장된 시나리오를 잃은 결함은 파일을 쓰기 전에 거부한다', async (): Promise<void> => {
    const scenario = { steps: [{ action: 'click' as const, selector: '.menu' }] }
    const { scenarioKey, qualifyDefectId } = await import('@inspector-agent/core')
    const key = scenarioKey(scenario)
    await engine.ingest([{ ...scanResult, scenarioKey: key, defects: [{ ...defect, id: qualifyDefectId('d_1', key), scenarioKey: key }] }], scenario)
    const store = JSON.parse(await readFile(join(dataDir, 'store.json'), 'utf8'))
    store.scenarios = {}
    await writeFile(join(dataDir, 'store.json'), JSON.stringify(store), 'utf8')
    const patch = await engine.proposePatch({ defectId: qualifyDefectId('d_1', key), file: 'src/A.css', edits: [EDIT], rationale: 'r' })
    await expect(engine.applyPatch(patch.id)).rejects.toMatchObject({ status: 409 })
    expect(await file()).toBe(ORIGINAL)
  })

  it('이미 처리된 패치는 다시 적용하거나 거절할 수 없다', async (): Promise<void> => {
    const patch = await propose()
    await engine.applyPatch(patch.id)
    await expect(engine.applyPatch(patch.id)).rejects.toMatchObject({ status: 409 })
    await expect(engine.rejectPatch(patch.id)).rejects.toMatchObject({ status: 409 })
  })

  it('거절한 패치는 적용할 수 없다', async (): Promise<void> => {
    const patch = await propose()
    await engine.rejectPatch(patch.id)
    await expect(engine.applyPatch(patch.id)).rejects.toMatchObject({ status: 409 })
    expect(await file()).toBe(ORIGINAL)
  })
})

describe('롤백과 삭제', () => {
  it('통과한 패치도 롤백하면 원본으로 돌아가고 결함이 다시 open 이 된다', async (): Promise<void> => {
    const patch = await propose()
    await engine.applyPatch(patch.id)
    const rolled = await engine.rollbackPatch(patch.id)
    expect(rolled.status).toBe('rolled-back')
    expect(await file()).toBe(ORIGINAL)
    expect((await engine.listDefects())[0]?.status).toBe('open')
  })

  it('적용 전(proposed) 패치는 롤백할 수 없다', async (): Promise<void> => {
    await expect(engine.rollbackPatch((await propose()).id)).rejects.toMatchObject({ status: 409 })
  })

  it('소스에 적용된 패치는 삭제할 수 없고(롤백 기준), 롤백한 뒤에는 삭제된다', async (): Promise<void> => {
    const patch = await propose()
    await engine.applyPatch(patch.id)
    await expect(engine.deletePatch(patch.id)).rejects.toMatchObject({ status: 409 })
    await engine.rollbackPatch(patch.id)
    await engine.deletePatch(patch.id)
    expect(await engine.listPatches()).toEqual([])
  })
})

describe('보안 검토 지적 사항 회귀 방지', () => {
  it('프로토타입 키(__proto__, constructor)는 결함·패치 id 로 쓸 수 없다', async (): Promise<void> => {
    await expect(engine.proposePatch({ defectId: '__proto__', file: 'src/A.css', edits: [EDIT], rationale: 'r' })).rejects.toMatchObject({ status: 404 })
    await expect(engine.getPatch('constructor')).rejects.toMatchObject({ status: 404 })
    await expect(engine.getContext('toString')).rejects.toMatchObject({ status: 404 })
    expect(await file()).toBe(ORIGINAL)
  })

  it('외부에서 들어온 스캔 결과의 위험한 id, 잘못된 시나리오, http(s) 가 아닌 url 은 저장하지 않는다', async (): Promise<void> => {
    await expect(engine.ingest([{ ...scanResult, defects: [{ ...defect, id: '__proto__' }] }])).rejects.toMatchObject({ status: 404 })
    await expect(engine.ingest([{ ...scanResult, url: 'file:///etc/passwd' }])).rejects.toMatchObject({ status: 400 })
    await expect(engine.ingest([{ ...scanResult, scenario: { steps: [{ action: 'x', ms: 1e9 }] } as never }])).rejects.toThrow()
  })

  it.each([
    ['.env', '.env'],
    ['설정 파일(vite.config)', 'vite.config.ts'],
    ['숨김 폴더', '.git/config.css'],
    ['저장소 폴더', '.inspector-agent/x.css']
  ])('화면 코드가 아닌 %s 는 읽지도 쓰지도 않는다', async (_name, path): Promise<void> => {
    await writeFile(join(root, path.includes('/') ? 'src/ok.css' : path), 'SECRET=1\n', 'utf8').catch((): undefined => undefined)
    await expect(propose({ file: path })).rejects.toMatchObject({ status: 400 })
  })

  it('데이터 폴더가 프로젝트 안의 보이는 이름이어도 그 안의 파일은 다루지 않는다', async (): Promise<void> => {
    const data = join(root, 'ia-data')
    await mkdir(data, { recursive: true })
    await writeFile(join(data, 'x.css'), ORIGINAL, 'utf8')
    const other = createEngine(resolveConfig({ projectRoot: root, dataDir: data, settleMs: 0 }), { measure: measure as never })
    await other.ingest([scanResult])
    await expect(other.proposePatch({ defectId: 'd_1', file: 'ia-data/x.css', edits: [EDIT], rationale: 'r' })).rejects.toMatchObject({ status: 400 })
  })

  it('승인 화면의 diff 를 속일 수 있는 제어 문자가 든 편집은 거부한다', async (): Promise<void> => {
    await expect(engine.proposePatch({ defectId: 'd_1', file: 'src/A.css', edits: [{ oldText: 'width: 300px;', newText: 'width: 1px;\u001b[2K' }], rationale: 'r' })).rejects.toMatchObject({ status: 422 })
  })

  it('같은 파일을 고치는 두 패치를 동시에 적용해도 하나만 반영되고 다른 하나는 충돌로 거부한다', async (): Promise<void> => {
    const first = await propose()
    const second = await engine.proposePatch({ defectId: 'd_1', file: 'src/A.css', edits: [{ oldText: 'width: 300px;', newText: 'width: 50%;' }], rationale: 'r' })
    const results = await Promise.allSettled([engine.applyPatch(first.id), engine.applyPatch(second.id)])
    expect(results.map((result): string => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(await file()).toContain('width: 100%')
    expect(await file()).not.toContain('50%')
  })

  it('같은 패치를 동시에 두 번 적용해도 한 번만 적용된다', async (): Promise<void> => {
    const patch = await propose()
    const results = await Promise.allSettled([engine.applyPatch(patch.id), engine.applyPatch(patch.id)])
    expect(results.map((result): string => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('적용한 뒤 사용자가 파일을 더 고쳤으면 롤백이 그 변경을 지우지 않는다', async (): Promise<void> => {
    const patch = await propose()
    await engine.applyPatch(patch.id)
    await writeFile(join(root, 'src/A.css'), '.box { width: 100%; } /* 내가 더 고침 */\n', 'utf8')
    await expect(engine.rollbackPatch(patch.id)).rejects.toMatchObject({ status: 409 })
    expect(await file()).toContain('내가 더 고침')
  })

  it('재측정 중에 사용자가 파일을 저장했으면 자동 롤백이 그 내용을 덮어쓰지 않고 상태를 기록한다', async (): Promise<void> => {
    measure.mockImplementationOnce(async () => {
      await writeFile(join(root, 'src/A.css'), '.box { width: 77px; } /* 측정 중 내가 저장 */\n', 'utf8')
      return verification(false)
    })
    const applied = await engine.applyPatch((await propose()).id)
    expect(applied).toMatchObject({ status: 'failed', autoRolledBack: false })
    expect(applied.error).toContain('직접 확인')
    expect(await file()).toContain('측정 중 내가 저장')
    expect((await engine.getPatch(applied.id)).status).toBe('failed')
  })

  it('저장소 파일이 깨졌으면 빈 저장소로 덮어쓰지 않고 멈춘다', async (): Promise<void> => {
    await writeFile(join(dataDir, 'store.json'), '{ 깨진 json', 'utf8')
    await expect(engine.listDefects()).rejects.toThrow('손상')
    await expect(engine.ingest([scanResult])).rejects.toThrow('손상')
    expect(await readFile(join(dataDir, 'store.json'), 'utf8')).toBe('{ 깨진 json')
  })
})

describe('저장소 위치 안전장치', () => {
  it('데이터 폴더는 스스로 git 에서 제외된다(결함 기록과 백업이 커밋되지 않게)', async (): Promise<void> => {
    expect(await readFile(join(dataDir, '.gitignore'), 'utf8')).toBe('*\n')
  })

  it('package.json 이 없는 폴더에서 시작됐으면 이유를 알려 준다', async (): Promise<void> => {
    expect(projectRootProblem(resolveConfig({ projectRoot: root }))).toContain('INSPECTOR_PROJECT_ROOT')
    await writeFile(join(root, 'package.json'), '{}', 'utf8')
    expect(projectRootProblem(resolveConfig({ projectRoot: root }))).toBeUndefined()
  })
})
