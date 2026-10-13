#!/usr/bin/env node
import { appendFile } from 'node:fs/promises'
import { formatMagnitude } from '@inspector-agent/core'
import { DEFAULT_VIEWPORTS, parseViewports, scanPage } from './index'
import { defectsAtOrAbove, parseFailOn, renderMarkdown } from './report'

/**
 * 사용법: inspector-scan <url> [--viewports 375,768x1024] [--report http://localhost:3000]
 *                         [--fail-on high|medium|low] [--summary <파일>]
 * --report   결과를 대시보드 /api/scans 로 전송한다.
 * --fail-on  해당 심각도 이상의 결함이 하나라도 있으면 종료 코드 1 (high: high 만, low: 전부)
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
    console.error('사용법: inspector-scan <url> [--viewports 375,768,1280] [--report <대시보드 URL>] [--fail-on high|medium|low] [--summary <파일>]')
    process.exitCode = 2
    return
  }
  const viewportFlag = readFlag(args, '--viewports')
  const report = readFlag(args, '--report')
  const summaryFile = readFlag(args, '--summary')
  // 스캔(수 초) 전에 잘못된 값을 먼저 알린다
  const failOn = parseFailOn(args.includes('--fail-on') ? (readFlag(args, '--fail-on') ?? '') : undefined)
  const results = await scanPage(url, viewportFlag ? parseViewports(viewportFlag) : DEFAULT_VIEWPORTS)

  for (const result of results) {
    console.log(`\n[${result.viewport.width}px] 결함 ${result.defects.length}건, 문서 가로 스크롤 ${result.documentOverflowPx}px`)
    for (const defect of result.defects) {
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(', ')
      console.log(`  - [${defect.severity}] ${source} ${formatMagnitude(defect)} (${hints})`)
    }
  }

  if (report) {
    const response = await fetch(new URL('/api/scans', report), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ results })
    })
    console.log(`\n대시보드 전송: ${response.status}`)
  }

  // 요약은 실패 판정과 무관하게 항상 남긴다 (실패한 job 에서 가장 필요하다)
  if (summaryFile) await appendFile(summaryFile, `${renderMarkdown(url, results, failOn)}\n`, 'utf8')

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
