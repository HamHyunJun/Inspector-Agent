#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises'
import { formatMagnitude, parseScenario } from '@inspector-agent/core'
import type { Scenario } from '@inspector-agent/core'
import { DEFAULT_VIEWPORTS, parseViewports, scanPage } from './index'
import { parseVariants } from './variants'
import { defectsAtOrAbove, parseFailOn, renderMarkdown } from './report'

/**
 * 사용법: inspector-scan <url> [--viewports 375,768x1024]
 *                         [--fail-on high|medium|low] [--summary <파일>] [--scenario <파일.json>] [--no-explore] [--variants dark,text-scale,...]
 * --variants 같은 규칙을 다른 환경에서도 돌린다: text-scale, long-text, dark, rtl, forced-colors, landscape, device:iphone|iphone-se|pixel|galaxy|ipad, engine:firefox|webkit, all(앞의 6개). 기본 상태에서 안 보이던 결함만 따로 보여 준다
 * --no-explore 시나리오 없이 스캔할 때 기본으로 켜지는 자동 탐색(툴팁·팝오버·드롭다운·모달을 눌러/올려 본 상태까지 검사)을 끈다
 * --fail-on  해당 심각도 이상의 결함이 하나라도 있으면 종료 코드 1 (high: high 만, low: 전부)
 * --scenario 스캔 전에 시드(localStorage/sessionStorage/쿠키)를 심고 단계(click/hover/fill/wait)를 실행한다. MCP 와 `inspector-agent fix` 가 같은 JSON 을 쓴다
 * --summary  마크다운 요약을 파일에 덧붙인다. GitHub Actions 에서는 "$GITHUB_STEP_SUMMARY" 를 넘긴다
 * 종료 코드: 0 통과 · 1 기준 초과 · 2 사용법 오류 또는 스캔 실패
 */
const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const url = args.find((arg): boolean => /^https?:\/\//.test(arg))
  if (!url) {
    console.error('사용법: inspector-scan <url> [--viewports 375,768,1280] [--fail-on high|medium|low] [--summary <파일>] [--scenario <파일.json>]')
    process.exitCode = 2
    return
  }
  const viewportFlag = readFlag(args, '--viewports')
  const summaryFile = readFlag(args, '--summary')
  const scenarioFile = readFlag(args, '--scenario')
  const variantsFlag = readFlag(args, '--variants')
  // 스캔 전에 잘못된 변형 이름부터 알린다
  if (variantsFlag) parseVariants(variantsFlag)
  // 스캔(수 초) 전에 잘못된 값을 먼저 알린다
  const failOn = parseFailOn(args.includes('--fail-on') ? (readFlag(args, '--fail-on') ?? '') : undefined)
  let scenario: Scenario | undefined
  if (scenarioFile) {
    try {
      scenario = parseScenario(JSON.parse(await readFile(scenarioFile, 'utf8')))
    } catch (error) {
      throw new Error(`--scenario ${scenarioFile} 를 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`)
    }
    console.log(`시나리오: ${scenario.name ?? scenarioFile}`)
  }
  const results = await scanPage(url, viewportFlag ? parseViewports(viewportFlag) : DEFAULT_VIEWPORTS, { scenario, explore: !args.includes('--no-explore'), variants: variantsFlag })

  const explored = results.filter((result): boolean => result.scenario !== undefined && scenario === undefined)
  console.log(`\n자동 탐색: 열어 본 상태 ${explored.length}개 (뷰포트 ${results.length - explored.length}개 기준)`)
  for (const result of results) {
    // 자동 탐색으로 열어 본 상태는 새 결함이 있을 때만 보여 준다
    if (explored.includes(result) && result.defects.length === 0) continue
    const opened = explored.includes(result) ? ` · ${result.scenario?.name}` : ''
    console.log(`\n[${result.viewport.width}px${opened}] 결함 ${result.defects.length}건, 문서 가로 스크롤 ${result.documentOverflowPx}px`)
    for (const defect of result.defects) {
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(', ')
      console.log(`  - [${defect.severity}] ${source} ${formatMagnitude(defect)} (${hints})`)
    }
  }

  // 요약은 실패 판정과 무관하게 항상 남긴다 (실패한 job 에서 가장 필요하다)
  if (summaryFile) await appendFile(summaryFile, `${renderMarkdown(url, results, failOn, scenario?.name)}\n`, 'utf8')

  if (failOn) {
    const failing = defectsAtOrAbove(results, failOn)
    if (failing.length > 0) {
      console.error(`\n실패: --fail-on ${failOn} 기준 ${failing.length}건`)
      process.exitCode = 1
    } else {
      console.log(`\n통과: ${failOn} 이상 결함 없음`)
    }
  }
}

main().catch((error: unknown): void => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 2
})
