# @inspector-agent/core

[Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent) 의 공용 엔진입니다. 실제 브라우저 렌더링에서 **레이아웃 결함을 규칙으로(LLM 없이) 탐지**하고, 결함을 에이전트가 읽기 좋은 압축 컨텍스트로 바꾸는 순수 함수와 타입을 제공합니다.

대부분은 이 패키지를 직접 쓰지 않고 [`@inspector-agent/verifier`](https://www.npmjs.com/package/@inspector-agent/verifier)(CLI)나 [`@inspector-agent/vite-plugin`](https://www.npmjs.com/package/@inspector-agent/vite-plugin)을 씁니다. 직접 쓰는 경우는 다음과 같습니다.

- 자체 도구에서 탐지기를 페이지에 주입해 결과를 받을 때
- 스캔 시나리오(JSON)를 검증하거나, 결함을 URL 과 무관하게 묶거나, 에이전트용 페이로드로 압축할 때

## 설치

```bash
npm install @inspector-agent/core
```

Node 20 이상, ESM 전용입니다.

## 브라우저에 탐지기 주입

`detector.global.js` 는 페이지에서 실행되는 IIFE 번들이며 `window.__INSPECTOR_AGENT__.detect()` 를 노출합니다.

```ts
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import type { ScanResult } from '@inspector-agent/core'

const detectorPath = createRequire(import.meta.url).resolve('@inspector-agent/core/detector.global.js')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
await page.goto('http://localhost:5173')
await page.addScriptTag({ content: await readFile(detectorPath, 'utf8') })
const result = await page.evaluate((): ScanResult => window.__INSPECTOR_AGENT__!.detect())
console.log(result.defects.map((defect) => `${defect.severity} ${defect.node.selector}`))
await browser.close()
```

탐지 종류는 `overflow-x`(가로 넘침, 같은 줄의 연쇄 결함 묶음 포함), `occluded`(팝업이 다른 요소에 가려짐, stacking context 원인 분석)입니다. 모달 포커스 이탈(`focus-escape`)은 실제 키 입력이 필요해 `@inspector-agent/verifier` 가 검사합니다.

## 주요 API

| 이름 | 하는 일 |
| --- | --- |
| `parseScenario(json)` | 스캔 시나리오(시드 + 클릭/입력/대기 단계)를 엄격하게 검증. 신뢰할 수 없는 입력용 |
| `scenarioKey(scenario)` | 시나리오 내용의 짧은 해시 키 |
| `groupDefects(defects)` | 같은 소스 위치·뷰포트의 결함을 URL 과 무관하게 묶기 |
| `toAgentPayload(defect)` | 결함을 에이전트에게 넘길 압축 페이로드로 변환 |
| `diagnose` / `diagnoseOcclusion` / `diagnoseFocus` | 결정론적 원인 분석과 후보 패치 |
| `applyEdits(content, edits)` | "정확히 한 번 등장하는 원문 → 새 내용" 편집 적용 |

타입(`Defect`, `ScanResult`, `Scenario` 등)은 모두 `index.d.ts` 로 제공됩니다.

## 라이선스

MIT
