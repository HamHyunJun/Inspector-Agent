# @inspector-agent/verifier

헤드리스 Chromium(Playwright)으로 페이지를 **여러 뷰포트에서 스캔**해 레이아웃 결함을 규칙으로 탐지하고, 패치 전후를 **같은 상태에서 재측정**하는 검증기입니다. CI 에서 쓰는 `inspector-scan` CLI 를 포함합니다. [Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent) 의 일부입니다.

탐지 종류: 가로·세로 오버플로우(연쇄 결함 묶음), 말줄임 없는 텍스트 잘림, 팝업 가려짐(stacking context 원인), **모달 포커스 이탈**(실제 Tab/Shift+Tab 입력).

## 설치

```bash
npm install -D @inspector-agent/verifier
npx playwright-core@1.56.1 install chromium   # 브라우저가 없다면 한 번 (또는 INSPECTOR_CHROMIUM_PATH 로 경로 지정)
```

Node 20 이상.

## CLI

```bash
npx inspector-scan http://localhost:5173 --viewports 375,768,1280 --fail-on high
```

| 옵션 | 설명 |
| --- | --- |
| `--viewports 375,768x1024` | 뷰포트 너비(또는 `너비x높이`) 목록. 기본 375, 768, 1280 |
| `--fail-on high\|medium\|low` | 해당 심각도 이상 결함이 하나라도 있으면 종료 코드 1 |
| `--summary 파일` | 마크다운 요약을 파일에 덧붙임. GitHub Actions 에서는 `"$GITHUB_STEP_SUMMARY"` |
| `--scenario 파일.json` | 스캔 전에 시드(localStorage/sessionStorage/쿠키)를 심고 단계(click/fill/wait)를 실행 |

종료 코드: `0` 통과 · `1` 기준 초과 · `2` 사용법 오류 또는 스캔 실패.

GitHub Actions 예시:

```yaml
- run: npx inspector-scan http://localhost:3000 --fail-on high --summary "$GITHUB_STEP_SUMMARY"
```

데이터가 있어야 그려지는 화면이나 클릭해야 열리는 UI 는 [시나리오](https://github.com/HamHyunJun/Inspector-Agent/blob/main/docs/scenarios/README.md)로 스캔합니다. 소스 위치(`파일:라인`)까지 보려면 앱의 개발 서버에 [`@inspector-agent/vite-plugin`](https://www.npmjs.com/package/@inspector-agent/vite-plugin) 을 켜세요.

## 자동 탐색

시나리오가 없으면 기본으로 켜져서, 툴팁·팝오버·드롭다운·탭·모달 트리거를 찾아 눌러/올려 본 상태까지 검사합니다. 결과는 `[뷰포트별 기본 상태..., 열어 본 상태들...]` 순서이고, 열어 본 상태의 `ScanResult.scenario` 에 그 상태를 다시 만드는 시나리오가 들어 있습니다. 끄려면 `explore: false`(CLI `--no-explore`), 한도는 `explore: { maxTriggers, budgetMs }`. 삭제·결제·제출처럼 보이는 버튼은 누르지 않고 `GET` 이 아닌 요청은 차단합니다.

## API

```ts
import { scanPage, measureDefect } from '@inspector-agent/verifier'

const [mobile] = await scanPage('http://localhost:5173', [{ width: 375, height: 812 }])
const target = mobile.defects[0]
// 패치를 적용한 뒤, 같은 URL·뷰포트·시나리오에서 다시 재서 통과 여부를 판정
const result = await measureDefect(target, mobile.defects)
console.log(result.passed, result.verdict)
```

통과 조건은 "대상 결함이 사라지고 새 결함이 없을 때"입니다. 가려짐은 비율이 0% 가 되어야 하고, 포커스 이탈은 두 방향 모두 막혀야 합니다.

## 라이선스

MIT
