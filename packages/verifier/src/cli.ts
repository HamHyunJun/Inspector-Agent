#!/usr/bin/env node
import { DEFAULT_VIEWPORTS, parseViewports, scanPage } from './index'

/**
 * 사용법: inspector-scan <url> [--viewports 375,768x1024] [--report http://localhost:3000]
 * --report 를 주면 결과를 대시보드 /api/scans 로 전송한다.
 */
const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const url = args.find((arg): boolean => /^https?:\/\//.test(arg))
  if (!url) {
    console.error('사용법: inspector-scan <url> [--viewports 375,768,1280] [--report <대시보드 URL>]')
    process.exitCode = 1
    return
  }
  const viewportFlag = readFlag(args, '--viewports')
  const report = readFlag(args, '--report')
  const results = await scanPage(url, viewportFlag ? parseViewports(viewportFlag) : DEFAULT_VIEWPORTS)

  for (const result of results) {
    console.log(`\n[${result.viewport.width}px] 결함 ${result.defects.length}건, 문서 가로 스크롤 ${result.documentOverflowPx}px`)
    for (const defect of result.defects) {
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const hints = defect.suggestions.map((suggestion): string => suggestion.hint).join(', ')
      console.log(`  - [${defect.severity}] ${source} ${defect.metrics.mode} +${defect.metrics.overflowPx}px (${hints})`)
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
}

main().catch((error: unknown): void => {
  console.error(error)
  process.exitCode = 1
})
