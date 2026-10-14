#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { parseViewports } from '@inspector-agent/verifier'
import { configFromEnv } from './config'
import { createEngine } from './engine'
import { isPatchId } from './ids'
import { EngineError } from './errors'
import type { Engine } from './engine'
import type { DefectGroupSummary } from './types'

/**
 * 사용법: inspector-agent fix <url> [--viewports 375,768x1024] [--yes]
 *         inspector-agent apply <패치 id> [--yes]   (AI 가 MCP 로 제안한 패치를 사람이 승인해 적용)
 *         inspector-agent rollback <패치 id>        (적용된 패치를 원본으로 되돌림)
 * 대시보드 없이 터미널에서 스캔 → 규칙 기반 패치 제안 → Diff 확인 → 승인 → 적용·재측정 → 실패하면 자동 롤백까지 한다.
 * 프로젝트 루트는 현재 폴더(INSPECTOR_PROJECT_ROOT 로 바꿈), 데이터는 <루트>/.inspector-agent 에 저장한다.
 * --yes 는 묻지 않고 모두 적용한다(재측정 실패는 그대로 자동 롤백). 대화형 터미널이 아니면 --yes 가 없을 때 제안만 저장하고 끝낸다.
 */
const USAGE = '사용법: inspector-agent fix <url> [--viewports 375,768x1024] [--yes]\n        inspector-agent apply <패치 id> [--yes]\n        inspector-agent rollback <패치 id>'

const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const describeGroup = (group: DefectGroupSummary): string => {
  const { defect } = group
  const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
  return `[${defect.severity}] ${source} (${defect.viewport.width}px, ${defect.kind})`
}

const fix = async (engine: Engine, url: string, args: string[]): Promise<number> => {
  const viewportFlag = readFlag(args, '--viewports')
  const yes = args.includes('--yes')
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

  console.log(`스캔 중: ${url}`)
  const summary = await engine.scan(url, viewportFlag ? parseViewports(viewportFlag) : undefined)
  console.log(`결함 ${summary.defects}건 (새로 ${summary.created}, 해소 ${summary.resolved})`)

  const groups = await engine.listGroups('open')
  if (groups.length === 0) {
    console.log('미해결 결함이 없습니다.')
    return 0
  }

  const rl = interactive && !yes ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
  let applyAll = yes
  let failed = 0
  let applied = 0
  try {
    for (const group of groups) {
      console.log(`\n${describeGroup(group)}`)
      let patch
      try {
        patch = await engine.proposeRulePatch(group.defect.id)
      } catch (error) {
        if (!(error instanceof EngineError)) throw error
        console.log(`  자동 수정 불가: ${error.message}`)
        failed++
        continue
      }
      console.log(patch.diff)
      if (!applyAll) {
        if (!rl) {
          console.log('  (대화형 터미널이 아니라 제안만 저장했습니다. 적용하려면 --yes 를 붙이세요)')
          continue
        }
        const answer = (await rl.question('적용하고 재측정할까요? [y]예 / [N]건너뛰기 / [a]이후 모두 / [q]중단 ')).trim().toLowerCase()
        if (answer === 'q') break
        if (answer === 'a') applyAll = true
        else if (answer !== 'y') {
          await engine.rejectPatch(patch.id)
          continue
        }
      }
      const result = await engine.applyPatch(patch.id)
      console.log(`  ${result.status === 'verified' ? '통과' : '실패'}: ${result.verification?.verdict ?? result.error ?? ''}${result.autoRolledBack ? ' (원본으로 자동 롤백)' : ''}`)
      if (result.status === 'verified') applied++
      else failed++
    }
  } finally {
    rl?.close()
  }
  console.log(`\n적용 ${applied}건 통과, 실패·건너뜀 ${failed}건`)
  return failed > 0 ? 1 : 0
}

/** 제안된 패치의 diff 를 보여 주고, 사람이 승인하면 적용·재측정한다. 재측정에 실패하면 자동으로 원본으로 되돌린다 */
const apply = async (engine: Engine, patchId: string, args: string[]): Promise<number> => {
  const patch = await engine.getPatch(patchId)
  console.log(`${patch.file}\n${patch.diff}`)
  if (!args.includes('--yes')) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('대화형 터미널이 아니라 승인을 받을 수 없습니다. 터미널에서 직접 실행하거나 --yes 를 붙이세요.')
      return 2
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question('적용하고 재측정할까요? [y/N] ')).trim().toLowerCase()
    rl.close()
    if (answer !== 'y') {
      console.log('적용하지 않았습니다. 파일은 바뀌지 않았습니다.')
      return 1
    }
  }
  const result = await engine.applyPatch(patchId)
  console.log(`${result.status === 'verified' ? '통과' : '실패'}: ${result.verification?.verdict ?? result.error ?? ''}${result.autoRolledBack ? ' (원본으로 자동 롤백)' : ''}`)
  return result.status === 'verified' ? 0 : 1
}

const main = async (): Promise<number> => {
  const [command, ...args] = process.argv.slice(2)
  const engine = createEngine(configFromEnv())
  const url = args.find((arg): boolean => /^https?:\/\//.test(arg))
  if (command === 'fix' && url) return fix(engine, url, args)
  const target = args.find(isPatchId)
  if (command === 'apply' && target) return apply(engine, target, args)
  if (command === 'rollback' && target) {
    const rolledBack = await engine.rollbackPatch(target)
    console.log(`${rolledBack.file} 을(를) 패치 적용 전으로 되돌렸습니다.`)
    return 0
  }
  console.error(USAGE)
  return 2
}

main().then(
  (code): void => void (process.exitCode = code),
  (error: unknown): void => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  }
)
