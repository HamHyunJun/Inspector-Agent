# Chrome 확장 테스트

`packages/extension` 은 **지금 보고 있는 탭**을 그대로 탐지해 대시보드로 보내는 MV3 확장입니다(헤드리스 스캔과 달리 로그인, 시드 데이터, 직접 연 팝업 상태까지 그대로 검사). 이 문서는 ① 자동 E2E 테스트와 ② 직접 로드해 보는 절차를 설명합니다.

## 1. 자동 E2E 테스트

```bash
pnpm dlx playwright@1.56.1 install chromium   # 한 번만 (INSPECTOR_CHROMIUM_PATH 로 경로를 줘도 됨)
pnpm --filter @inspector-agent/extension test  # 확장 빌드 → Chromium 에 로드 → 단위 + E2E
```

루트의 `pnpm test` 도 이 테스트를 포함하고, CI(`.github/workflows/ci.yml`)가 매 PR 에서 돌립니다.

### 무엇을 증명하나

`packages/extension/test/e2e.test.ts` 는 **실제 Chromium** 에 빌드된 확장을 `launchPersistentContext` 로 로드합니다.

| 검사 | 내용 |
| --- | --- |
| 로드 | 확장이 실제로 로드되어 `chrome-extension://<id>/popup.html` 이 열린다 |
| 일반 스캔 | 데스크톱 폭(1280px)에서는 결함 0건. popup 이 대시보드로 `POST /api/scans` 를 보낸다 |
| Origin, CORS | 요청의 `Origin` 이 `chrome-extension://<id>` 이고 **CORS 사전 점검(OPTIONS) 없이** 전송된다. 대시보드가 CORS 를 열 필요가 없다는 근거다 |
| 에뮬레이션 | "뷰포트 에뮬레이션"을 켜고 375px 로 스캔하면 375px 폭의 결함이 탐지되어 전송되고(`section.card > div.wide-box`, `fixed-width`), 상태 문구에 `(에뮬레이션)` 이 붙는다 |
| 원복 | 에뮬레이션 스캔이 끝나면 탭의 `window.innerWidth` 가 원래 폭으로 돌아온다 |
| 실패 처리 | 대시보드가 500 을 돌려줘도 `실패: 대시보드 응답 500` 이 보이고 에뮬레이션은 원복된다 |

`test/emulation.test.ts` 는 `chrome.debugger` 호출 순서(붙이기 → 폭 설정 → 작업 → 원복 → 해제)와, 작업이나 원복이 실패해도 디버거를 반드시 떼는지를 가짜 디버거 API 로 검사합니다.

### 구현 메모

- **확장은 새 headless(`channel: 'chromium'`)에서만 로드됩니다.** 기본 `headless: true` 가 쓰는 headless shell 은 확장을 지원하지 않습니다. 로컬에 새 headless 가 없으면 `INSPECTOR_CHROMIUM_PATH` 로 일반 Chromium 경로를 주세요.
- **확장 ID**: 백그라운드 스크립트가 없어 ID 를 알아낼 방법이 없으므로, 테스트가 임시 RSA 키를 만들어 복사한 manifest 에만 `key` 로 넣고 ID 를 계산합니다(공개 키 DER 의 SHA-256 앞 16바이트를 a-p 로 변환). **배포용 `public/manifest.json` 은 바뀌지 않습니다.**
- **대시보드는 가짜 서버**로 대신합니다. 전송 내용과 Origin, OPTIONS 여부를 기록하기 위해서입니다. 실제 대시보드로 확인하는 방법은 아래 2-4 를 보세요.
- **대상 탭 지정**: 팝업을 탭으로 열면 활성 탭이 팝업 자신이 되므로, `popup.html?tabId=<번호>` 로 스캔할 탭을 지정하는 훅이 있습니다(테스트 외에 두 번째 창에서 팝업을 열어 쓸 때도 유용합니다). 번호를 안 주면 기존처럼 활성 탭을 스캔합니다.

## 2. 직접 로드해 보는 절차

### 2-1. 빌드

```bash
pnpm install          # prepare 단계에서 packages/* 가 자동 빌드됩니다
pnpm --filter @inspector-agent/extension build   # 확장만 다시 빌드할 때
```

결과는 `packages/extension/dist` 입니다(`manifest.json`, `popup.html`, `popup.js`, `detector.global.js`).

### 2-2. Chrome 에 로드

1. 주소창에 `chrome://extensions` 를 열고 오른쪽 위 **개발자 모드** 를 켭니다.
2. **압축해제된 확장 프로그램을 로드합니다** → `packages/extension/dist` 폴더를 선택합니다.
3. 목록에 **Inspector-Agent** 가 보이고 오류가 없어야 합니다. 소스를 고친 뒤에는 다시 빌드하고 카드의 새로고침(↻) 버튼을 누르세요.
4. 툴바의 퍼즐 아이콘에서 Inspector-Agent 를 고정(핀)해 두면 편합니다.

### 2-3. 스캔

1. 대시보드를 띄웁니다: `pnpm dev:dashboard` (http://localhost:3000).
2. 검사할 페이지를 열고(예: `pnpm dev:playground` 의 http://localhost:5173) 확장 아이콘을 눌러 팝업을 엽니다.
3. **대시보드 URL** 에 `http://localhost:3000` 을 입력합니다(기본값, 입력값은 저장됩니다).
4. **현재 탭 스캔** 을 누르면 팝업에 `[severity] 파일:라인 +Npx` 목록이 보이고, 상태에 `N px 뷰포트에서 결함 M건을 대시보드로 보냈습니다.` 가 나옵니다.
5. 대시보드 목록에서 같은 결함이 보이는지 확인합니다.

### 2-4. 375px 로 검사하기 (뷰포트 에뮬레이션)

1. 팝업에서 **폭을 바꿔 검사(chrome.debugger)** 를 체크하고 폭(기본 375)을 정합니다(240~3840).
2. **현재 탭 스캔**. 스캔하는 동안 탭 위에 **"Inspector-Agent 이(가) 이 브라우저를 디버깅하기 시작했습니다"** 안내줄이 잠깐 보입니다. 이것은 `chrome.debugger` 권한의 정상 동작이며 숨길 수 없습니다.
3. 스캔이 끝나면 에뮬레이션이 자동으로 원복되고 안내줄이 사라집니다. 상태 문구는 `375px 뷰포트(에뮬레이션)에서 …` 입니다.

DevTools 기기 모드(Ctrl/Cmd+Shift+M)로 좁혀 놓고 에뮬레이션 없이 스캔해도 같은 결과입니다. 에뮬레이션 옵션은 그 단계를 줄여 줍니다.

## 3. 실제 대시보드로 확인한 결과

자동 테스트는 가짜 대시보드를 쓰므로, 같은 흐름을 실제 대시보드(`pnpm dev:dashboard`)로 한 번 확인했습니다.

- 팝업 → `375px 뷰포트(에뮬레이션)에서 결함 1건을 대시보드로 보냈습니다.` → 대시보드에 `high · main > section.card > div.wide-box · 375px · 미해결` 이 저장됩니다.
- 같은 요청을 다른 웹사이트 Origin(`http://evil.example`)으로 보내면 403 입니다. 확장은 허용되고 일반 웹사이트는 차단되므로, 대시보드가 CORS 를 열지 않아도 확장이 동작한다는 뜻입니다.

## 4. 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 팝업: `실패: Failed to fetch` | 대시보드에 연결할 수 없음. Nuxt 개발 서버가 환경에 따라 `localhost` 의 IPv6(`::1`)로만 떠서 `http://127.0.0.1:3000` 은 거부될 수 있다 | 대시보드 URL 을 `http://localhost:3000` 으로 입력. 대시보드가 켜져 있는지 확인 |
| 팝업: `실패: 대시보드 응답 403` | 대시보드 요청 검사가 호스트를 거부(`localhost`/`127.0.0.1`/`[::1]` 이외의 이름) | 로컬 주소로 열거나 `INSPECTOR_ALLOWED_HOSTS` 에 추가 |
| 팝업: `탐지기를 실행하지 못했습니다` | 확장을 로드하기 전에 연 탭이거나 `chrome://` 같은 확장이 접근할 수 없는 페이지 | 탭을 새로고침. `localhost`/`127.0.0.1` 페이지만 지원 |
| 에뮬레이션: `Another debugger is already attached` | 그 탭에 DevTools 등 다른 디버거가 붙어 있음 | DevTools 를 닫고 다시 시도(에뮬레이션 없이 스캔은 가능) |
| 에뮬레이션 후 탭 크기가 그대로 | 확장 서비스가 중간에 종료되는 등 매우 드문 경우 | 탭을 새로고침하면 원래대로. 이 경우 디버거 안내줄의 "취소" 로 연결을 끊을 수 있음 |
| 테스트: `Executable doesn't exist` / 확장이 로드되지 않음 | Chromium 미설치, 또는 headless shell 만 있음 | `pnpm dlx playwright@1.56.1 install chromium`. 확장 테스트는 새 headless(`channel: 'chromium'`)가 필요 |

## 5. 알려진 한계

- 확장은 **모달 포커스 이탈 검사를 하지 않습니다**(실제 키 입력이 필요해 헤드리스 스캔이 담당합니다).
- 시나리오(`docs/scenarios`)를 쓰지 않습니다. 지금 보는 탭 상태가 곧 시나리오입니다.
- 한 번에 하나의 폭만 검사합니다(여러 폭은 폭을 바꿔 여러 번 스캔).
- `localhost` / `127.0.0.1` 페이지와 대시보드만 허용합니다(`host_permissions`).
- 에뮬레이션은 폭만 바꿉니다(모바일 플래그, 터치, 사용자 에이전트는 바꾸지 않음).
