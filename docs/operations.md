# 운영 가이드

내 프로젝트에 붙여 두고 매일 쓰는 방법의 상세입니다. 처음 설치와 기본 사용은 [README](../README.md)에 있고, 여기에는 일상 루프, 결함별 대응, 자율 모드, CI, 데이터 관리, 오탐 대응, 문제 해결을 모았습니다.

## 누가 무엇을 하나

| 구성 요소 | 하는 일 | 언제 켜 두나 |
| --- | --- | --- |
| 내 앱의 개발 서버 | Vite 플러그인이 `.vue` 요소에 `data-ia-src="파일:라인:컬럼"` 을 주입 (개발 서버 전용) | 개발하는 동안 |
| 엔진 (`@inspector-agent/engine`) | 결함·패치 저장, 스캔, 컨텍스트, 패치 제안·적용·재측정·자동 롤백. **내 프로젝트 파일을 실제로 쓰는 유일한 코드**이고 MCP 서버, `inspector-agent` CLI, 대시보드가 같은 엔진을 씁니다 | MCP·CLI 가 실행될 때 |
| MCP 서버 | Claude Code 가 쓰는 도구(`scan_page`, `list_defects`, `get_defect_context`, `propose_patch`, `get_patch_status`, `apply_patch`). 독립 모드에서는 이 프로세스의 엔진이 모든 일을 합니다(대시보드 불필요) | Claude Code 세션 동안 (자동 실행) |
| 대시보드 (`pnpm dev:dashboard`, 선택) | 결함 목록·소스 매핑·Diff 를 화면으로 보고 적용·롤백도 할 수 있다. 같은 `.inspector-agent` 저장소를 읽는다 | 화면으로 보고 싶을 때 |
| `inspector-agent` CLI | `fix <url>`(스캔 → 규칙 기반 제안 → 승인 → 적용·재측정), `apply <패치 id>`(AI 제안을 사람이 승인) | 필요할 때 |
| `inspector-scan` CLI | 스캔만 하고 종료 코드로 판정. CI 용 | 필요할 때 / CI |
| Chrome 확장 | 지금 보고 있는 탭을 그대로 탐지해 대시보드로 전송 | 로그인·데이터가 필요한 화면을 볼 때 |

에이전트는 파일을 직접 고치지 않습니다. **제안(`propose_patch`) → 사람이 승인(또는 자율 모드) → 엔진이 백업·반영·재측정** 순서로만 파일이 바뀌고, 재측정에 실패하면 엔진이 원본으로 되돌립니다.

## 일상 운영 루프

1. **켜기**: 내 앱 개발 서버, 대시보드(터미널 2개). Claude Code 를 쓰면 MCP 서버는 자동으로 뜹니다.
2. **스캔**: 화면을 만들거나 고친 뒤 스캔합니다(아래 "스캔 방법 고르기"). 기본 뷰포트는 320/375/414/768/1024/1280px 6개이고, 눌러야 열리는 UI 는 자동 탐색이 열어 봅니다. 저장소에는 뷰포트·URL 마다 별개로 기록되지만(URL 별 검증과 기준선 유지), 목록에는 **같은 소스 위치·뷰포트의 결함이 URL 이 달라도 한 건으로 묶여** 보이고 `발생 URL N개`를 펼치면 URL 별 상태가 나옵니다. 상태는 URL 별 상태를 합친 값(하나라도 미해결이면 미해결)입니다.
3. **우선순위 정하기**: 대시보드 목록은 심각도 순입니다. 먼저 `high`(24px 이상 넘침, 페이지 가로 스크롤 유발, 가려짐 80% 이상, 포커스 이탈)를 처리하고, 같은 컴포넌트에서 나온 URL 별 중복은 이미 한 건으로 묶여 있고, 뷰포트별 결함은 같은 파일을 고치면 같이 사라집니다. 다른 URL 의 해소는 그 URL 을 다시 스캔해 확인하세요. 한 원인이 같은 줄의 뒤쪽 요소를 밀어낸 경우(예: 긴 이름이 배지를 밀어냄)는 원인 하나로 묶이고 뒤쪽 요소는 **연쇄 결함 N건**으로 표시되니, 원인만 고치면 됩니다.
4. **패치 만들기** (둘 중 하나)
   - **에이전트**: Claude Code 에서 `/ia scan` 을 실행합니다(설치는 README 의 B 절). 명령 대신 `inspector-agent 로 ... high 결함부터 패치를 제안해줘` 처럼 말로 요청해도 됩니다. 에이전트는 `get_defect_context` 로 압축 컨텍스트(수치, 템플릿 스니펫, 노드·부모·자식 SCSS 규칙, 진단)를 읽고 `propose_patch` 로 제안합니다.
   - **규칙 기반**: 대시보드 결함 상세의 **이 규칙으로 패치 제안** 버튼. 선언만으로 고칠 수 있는 진단(오버플로우, z-index 부족)에만 나타납니다.
5. **검토하고 적용**: 결함 상세의 Diff 를 읽고 **적용하고 검증**을 누릅니다. 대시보드가 백업 → 반영 → `INSPECTOR_SETTLE_MS` 만큼 HMR 대기 → 같은 URL·뷰포트로 재측정합니다. 통과(검증 통과)하면 결함이 `resolved`, 실패하면 자동 롤백되고(`open`) 사유가 한 줄로 남습니다. 필요 없는 제안은 **거절**합니다.
6. **실패했을 때**: 검증 문구(예: `오버플로우가 180px → 42px로 남아 있습니다`, `새 결함 1건이 생겼습니다`)를 에이전트에게 그대로 주고 다시 제안하게 합니다. 복합 원인(예: flex item `min-width: auto` + 자식 `nowrap`)은 한 번에 둘 다 고쳐야 통과합니다.
7. **롤백**: 통과한 패치도 나중에 **롤백**할 수 있습니다(백업에서 복구).
8. **해소 확인과 커밋**: 같은 URL·뷰포트를 다시 스캔하면 사라진 `open` 결함이 `resolved` 로 바뀝니다(스캔 결과의 "해소 N건"). `git diff` 로 최종 변경을 한 번 더 확인하고 커밋합니다.

## 결함 종류별 대응

| 종류 | 무엇이 문제인가 | 자동(규칙) 패치 | 처리 요령 | 재측정 통과 기준 |
| --- | --- | --- | --- | --- |
| `overflow-x` | 박스·텍스트가 부모 콘텐츠 영역을 넘음 | 대부분 가능 | 진단 1순위(`flex-item-min-width`, `flex-shrink-disabled`, `fixed-width`, `unbreakable-text`…)를 먼저 시도. 자식이 원인이면 노드와 자식을 함께 수정 | 넘친 px 가 0, 새 결함 없음 |
| `overflow-y` | 높이가 고정된 컨테이너(`overflow-y: visible`) 밖으로 흐름 안 콘텐츠가 넘쳐 아래 요소와 겹침. 스크롤·잘림 컨테이너, 절대 위치 팝업, float 는 제외 | 대부분 가능 | `fixed-height`: `height: auto` + `min-height`(현재 높이를 유지). 높이를 유지해야 하면 `vertical-scroll`: `overflow-y: auto` | 넘친 px 가 0, 새 결함 없음 |
| `clipped-text` | `overflow: hidden` 인데 `text-overflow: ellipsis` 가 없어 글자가 잘렸다는 표시 없이 사라짐. input, 말줄임, line-clamp, sr-only, 캐러셀 카드는 제외 | 가능 | `text-ellipsis`: 한 줄 라벨이면 말줄임(+ `white-space: nowrap`). 내용이 중요하면 `text-wrap`: `white-space: normal` + `overflow-wrap: anywhere` | 잘린 px 가 0 이거나 말줄임이 적용됨 |
| `occluded` | 모달·드롭다운 같은 팝업이 다른 요소에 가려짐 | `z-index-too-low` 만 가능 | `stacking-context-trap` 은 z-index 를 올려도 소용없음. 갇힌 조상의 `transform`/`opacity`/`filter` 등을 없애거나 팝업을 `<Teleport to="body">` 로 옮김. `overflow-clipped-popup` 은 자르는 조상의 `overflow` 를 풀거나 팝업을 body 로 이동 | 가려진 비율이 **0%** (일부만 풀려도 실패) |
| `focus-escape` | 열린 모달에서 Tab/Shift+Tab 으로 포커스가 모달 밖으로 나감 | 불가능(JS 필요) | 모달 안 `keydown` 핸들러로 첫/마지막 요소를 순환시키거나 배경에 `inert`, 네이티브 `<dialog>.showModal()` 사용. `aria-modal` 은 포커스를 가두지 않음 | 앞·뒤 **두 방향 모두** 모달 안에 머묾 |

자동 패치가 불가능한 결함은 에이전트가 구조를 바꿔 제안해야 하고, 대시보드는 그런 제안에 대해서는 규칙 패치 버튼을 보여 주지 않습니다.

## 승인 모드와 자율 모드

| | 승인 모드 (기본) | 자율 모드 (`INSPECTOR_ALLOW_AGENT_APPLY=1`) |
| --- | --- | --- |
| 에이전트가 하는 일 | 제안까지 | 제안 → `apply_patch` 로 적용 → 재측정 결과를 보고 재제안 |
| 파일 반영 | 사람이 승인: 승인 창을 지원하는 클라이언트는 그 창(diff 표시), 아니면 터미널 `inspector-agent apply`, 대시보드 모드는 대시보드 화면 | 사람 승인 없이 바로 반영 |
| 켜는 방법 | 기본값 | `.mcp.json` 의 `env` 에 `"INSPECTOR_ALLOW_AGENT_APPLY": "1"` 추가 후 Claude Code 재시작 |

자율 모드는 켜기 전에 아래를 지키는 것을 권장합니다.

- **전용 브랜치에서, 작업 트리를 깨끗하게 한 뒤** 켭니다. 끝난 뒤 `git diff` 가 곧 에이전트가 한 일의 전부입니다.
- 엔진의 **안전장치**는 이렇습니다: 모든 경로가 `INSPECTOR_PROJECT_ROOT` 안으로 제한되고 `node_modules` 와 루트 밖을 가리키는 심볼릭 링크는 거부, 반영 전 백업, 제안 이후 파일이 바뀌었으면 적용 거부(409), 재측정 실패 시 자동 롤백. (대시보드를 쓸 때) API 는 CORS 를 열지 않고, 로컬 주소가 아닌 Host(DNS 리바인딩)와 다른 웹사이트에서 온 쓰기 요청(Origin 불일치)을 403 으로 거부합니다. MCP 서버, CLI, 대시보드 화면, Chrome 확장은 그대로 동작합니다.
- 하지만 **검증은 "대상 결함이 사라졌고, 같은 뷰포트에 새 결함이 없다"까지만** 봅니다. 다른 페이지, 다른 뷰포트, 열려야 보이는 UI 에서 생긴 회귀와 디자인 의도는 못 봅니다. 자율 모드가 끝나면 사람이 diff 를 훑고, 모든 뷰포트로 다시 스캔하세요.
- **시도 횟수 제한은 코드에 없습니다.** 에이전트에게 "결함당 최대 3회, 그래도 안 되면 멈추고 보고"처럼 지시하세요(벤치마크 실측도 이 조건이었습니다).
- 대상은 로컬 개발 서버와 로컬 프로젝트 루트입니다. 원격·프로덕션 URL 을 스캔할 수는 있어도 거기에는 `data-ia-src` 가 없어 소스 매핑이 안 됩니다.

## 스캔 방법 고르기

| 방법 | 어떻게 | 특징 | 한계 |
| --- | --- | --- | --- |
| 대시보드 폼 | 메인 화면의 **스캔 실행** (URL, 뷰포트 입력) | 가장 간단. 결과가 바로 저장됨 | URL 만 연다 (아래 참고) |
| MCP `scan_page` | 에이전트에게 "스캔해줘" | 에이전트가 스캔→패치를 한 번에 진행 | 대시보드 폼과 같음 |
| CLI | `node packages/verifier/dist/cli.js <url> [--viewports 375,768x1024] [--report http://localhost:3000] [--fail-on high] [--summary 파일] [--scenario 파일.json] [--no-explore]` | 종료 코드·마크다운 요약. `--report` 로 대시보드에도 저장 | 같음 |
| Chrome 확장 | `pnpm build` 후 `packages/extension/dist` 를 `chrome://extensions` → **압축해제된 확장 프로그램 로드**. 확장 팝업에 대시보드 주소 입력 | **지금 보고 있는 탭 그대로** 탐지 (로그인, 시드 데이터, 인터랙션 후 상태 포함) | `localhost`/`127.0.0.1` 만, 한 번에 폭 하나(기본은 탭의 실제 너비, 팝업의 **뷰포트 에뮬레이션**(`chrome.debugger`)으로 375px 등으로 바꿔 검사), **모달 포커스 이탈 검사는 하지 않음**. 로드 절차와 자동 E2E 는 [`docs/extension-testing.md`](extension-testing.md) |

**자동 탐색(기본 켜짐).** 시나리오 없이 스캔해도 대시보드·MCP·CLI 가 작은 화면부터 큰 화면까지(320/375/414/768/1024/1280px) 재 보고, 페이지에서 눌러 볼 만한 것(`aria-expanded`/`aria-haspopup` 트리거, 툴팁, 탭, 아코디언, 일반 버튼, CSS `:hover` 로만 열리는 메뉴)을 **스스로 찾아 hover/click** 한 뒤 열린 상태까지 검사합니다. 열었을 때만 생기는 결함(툴팁·팝오버가 화면 밖으로 나감, 모달 가려짐·포커스 이탈 등)이 "자동 탐색: click …" 이름의 상태로 따로 기록되고, 각 상태는 그 상태를 다시 만드는 시나리오로 저장되어 패치 후 재측정도 같은 상태에서 합니다. 안전을 위해 삭제·결제·제출·로그아웃처럼 보이는 버튼과 제출 버튼은 누르지 않고, 탐색 중 `GET` 이 아닌 요청은 차단하며, 새 창·내려받기·`confirm` 창은 막습니다. 끄려면 CLI `--no-explore`, API `explore: false`. 직접 시나리오를 주면 그 시나리오가 우선이라 탐색하지 않습니다.

**로그인이 필요하거나 데이터가 있어야 그려지는 화면은 시나리오로 스캔하세요.** 헤드리스 스캔은 URL 만 열기 때문에 데이터가 있어야 그려지는 화면은 빈 상태로 검사되고, 이때 "결함 0건"은 **안전하다는 뜻이 아닙니다.** 또 스캔 시점에 **이미 열려 있는** 모달·드롭다운만 가려짐·포커스 검사 대상입니다. **시나리오**는 스캔 전에 `localStorage`/`sessionStorage`/쿠키 시드를 심고 클릭·입력·대기 단계를 실행하는 JSON 이며, 위 네 가지 경로(대시보드, MCP, CLI, 패치 후 재측정)가 같은 파일을 그대로 씁니다.

```bash
node packages/verifier/dist/cli.js http://localhost:5173 --scenario docs/scenarios/example-seed.json
```

- 형식, 한도, 경로별 사용법, 내 앱의 시나리오 만드는 법은 [`docs/scenarios/README.md`](scenarios/README.md), 예시는 `docs/scenarios/` 에 있습니다.
- 시나리오 스캔의 결함은 시나리오 키가 id 에 섞여 같은 URL 의 일반 스캔과 별개로 기록됩니다(서로를 `resolved` 로 바꾸지 않음). 패치 후 재측정은 저장된 같은 시나리오로 합니다. 시나리오 없이 재측정하면 닫힌 메뉴를 재서 고치기 전에도 "통과"가 나오기 때문입니다.
- **비밀번호, 토큰, 실제 세션 쿠키는 넣지 마세요.** 시나리오는 대시보드 저장소에 평문으로 저장됩니다.
- 확장은 시나리오를 쓰지 않습니다(지금 보는 탭 그대로 검사). 폭만 바꾸려면 확장의 뷰포트 에뮬레이션 옵션을 쓰세요.

## CI 운영

이 저장소에는 워크플로가 둘 있습니다.

- `.github/workflows/ci.yml` (모든 PR, `main`): 타입체크, 단위 테스트, 탐지 회귀 벤치마크(`pnpm bench`, 근사 토큰 모드). 정답표·대조군의 불변 조건(재현율·정밀도 100%, 대조군 오탐 0건, 1280px 결함 0건)이 깨지면 실패하므로 탐지 규칙을 바꾸는 PR 이 회귀를 만들면 막힙니다.
- `.github/workflows/layout-scan.yml` (수동 실행): playground 를 띄워 스캔하고, 기준 이상 결함이 있으면 실패하며 결과 표를 job summary 에 남깁니다. **이 저장소의 playground 는 벤치마크용 결함이 일부러 심겨 있어 항상 실패하는 것이 정상**이라 PR 마다 돌리지 않습니다. 내 앱에 쓸 때는 아래처럼 바꾸고 트리거에 `pull_request` 를 추가하세요.

내 앱에 쓰려면 워크플로의 "playground 실행" 단계와 `SCAN_URL` 을 내 앱의 실행 명령·주소로 바꿉니다.

```yaml
- run: pnpm start &                      # 내 앱 개발 서버 (플러그인이 켜진 개발 모드여야 소스 위치가 나옴)
- run: |
    for _ in $(seq 1 60); do curl -sf http://localhost:3000 >/dev/null && break; sleep 1; done
- run: node packages/verifier/dist/cli.js http://localhost:3000 --fail-on high --summary "$GITHUB_STEP_SUMMARY"
```

- **종료 코드**: `0` 통과 · `1` 기준 초과 · `2` 사용법 오류 또는 스캔 실패.
- **도입 순서 권장**: 처음에는 `--fail-on high` 로 시작해 기존 결함을 정리한 뒤 `medium` → `low` 로 낮춥니다. 처음부터 `low` 로 켜면 기존 결함 때문에 모든 PR 이 막힙니다.
- 요약은 실패해도 항상 남습니다. 표의 **위치**(`파일:라인`)로 바로 이동해 고치면 됩니다.
- CI 도 "스캔 방법 고르기"의 한계를 그대로 가집니다. 빈 상태 화면은 CI 에서도 빈 상태로 검사됩니다.
- PR 코멘트 게시와 기존 결함 기준선(허용 목록) 파일은 아직 없습니다.
- 위 예시는 이 저장소(`Inspector-Agent`)의 빌드 결과를 쓰므로, 내 앱의 CI 에서는 이 저장소를 함께 체크아웃해 `pnpm install && pnpm build` 한 뒤 경로를 맞춰야 합니다. npm 에 배포된 뒤([`releasing.md`](releasing.md))에는 `npm install -D @inspector-agent/verifier` 후 `npx inspector-scan <url> --fail-on high` 만으로 됩니다.

## 데이터와 상태 관리

- **저장 위치**: `INSPECTOR_DATA_DIR`(기본 `apps/dashboard/.inspector-agent`)의 `store.json`(결함·패치·재측정 기준선)과 `backups/<패치id>.bak`(적용 직전 원본). 사람이 열어 볼 수 있는 JSON 이고, 폴더를 지우면 초기화됩니다(대상 프로젝트 파일에는 영향 없음).
- **결함 상태**: `open`(미해결) · `patched`(자동 롤백 없이 파일에 남은 상태) · `resolved`(해결). 같은 URL·뷰포트를 재스캔했는데 사라진 `open` 결함만 `resolved` 가 되고, 해결된 결함이 다시 나타나면 `open` 으로 돌아옵니다.
- **패치 상태**: `proposed`(검토 대기) · `verified`(검증 통과) · `failed`(검증 실패, 보통 자동 롤백됨) · `rolled-back` · `rejected`.
- **여러 프로젝트를 다룰 때**: 독립 모드(MCP, CLI)는 프로젝트마다 자기 폴더의 `.inspector-agent/` 를 쓰므로 따로 할 일이 없습니다. 대시보드를 쓴다면 프로젝트마다 인스턴스를 따로 띄웁니다. 포트, `INSPECTOR_PROJECT_ROOT`, `INSPECTOR_DATA_DIR` 를 모두 다르게 주고, 그 프로젝트의 `.mcp.json` 에 해당 포트를 `INSPECTOR_DASHBOARD_URL` 로 적습니다.

  ```bash
  cd apps/dashboard
  NUXT_IGNORE_LOCK=1 INSPECTOR_PROJECT_ROOT=/abs/other-app INSPECTOR_DATA_DIR=$PWD/../../.data/other-app \
    pnpm exec nuxt dev --port 3001
  ```

  같은 `apps/dashboard` 에서 둘 이상 띄우면 Nuxt 가 실행 잠금을 걸어 두 번째가 거부되므로 `NUXT_IGNORE_LOCK=1` 이 필요하고, 두 인스턴스가 `.nuxt` 폴더를 공유한다는 점을 알아 두세요.
- **탐지기 규칙이나 패키지를 고친 뒤에는** `pnpm build` 를 하고 **대시보드(와 Claude Code)를 재시작**하세요. 오래 떠 있던 개발 서버는 옛 모듈을 메모리에 들고 있어 새 코드와 맞지 않으면 500 이 납니다(문제 해결).

## 오탐·미탐 대응

- **일시적으로 제외**: 검사에서 빼고 싶은 요소(또는 그 하위 전체)에 `data-ia-ignore` 속성을 붙입니다. 오버플로우, 가려짐, 모달 포커스 검사에 모두 적용됩니다. 의도한 겹침이나 스크롤이면 이유를 주석으로 남기세요.
- **오탐을 발견했다면**: 재현 컴포넌트를 `apps/playground/src/components/` 에 **정상 대조군**으로 추가하고 `benchmarks/src/fixtures.ts` 의 `NEGATIVE_CONTROLS` 에 등록한 뒤, 탐지 규칙을 고치고 `pnpm bench` 에서 대조군 오탐 0건이 유지되는지 확인합니다(불변 조건이 깨지면 `pnpm bench` 가 종료 코드 1 로 끝나므로 CI 도 같은 기준으로 실패합니다).
- **탐지 규칙을 고칠 때의 최소 확인**: `pnpm test` → `pnpm typecheck` → `pnpm bench`. 토큰 수까지 재려면 `ANTHROPIC_API_KEY` 가 필요하고, 없으면 `INSPECTOR_BENCH_ESTIMATE=1` 로 근사 모드를 쓸 수 있습니다(결과에 `method: estimate` 표시).
- **알려진 미탐 영역**: 세로 방향의 텍스트 잘림(고정 높이 + `overflow: hidden` 으로 글줄이 잘리는 경우), 텍스트 대비 등 접근성 일반, 시나리오에 단계로 정의하지 않은 인터랙션 후의 UI, `transform` 이 걸린 요소의 박스 오버플로우. [로드맵](overview.md#한계와-로드맵)을 참고하세요.

## 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/mcp` 에서 `CONNECTION_CLOSED` | MCP 서버 빌드 결과물이 없음 | `pnpm build` 후 Claude Code 재시작 |
| 결함 컨텍스트에 템플릿·SCSS 규칙이 비어 있음 (`rawFile: 0`) | `INSPECTOR_PROJECT_ROOT` 가 `data-ia-src` 경로의 기준(프로젝트 루트)과 다름, 또는 플러그인이 옛 버전 | 루트를 `package.json` 이 있는 폴더로 지정, `pnpm build` 로 플러그인 재빌드 후 앱 개발 서버 재시작 |
| 화면은 깨져 보이는데 스캔은 0건 | 빈 상태/로그인 필요/닫힌 팝업을 검사함, 또는 `data-ia-ignore` 로 제외됨 | "스캔 방법 고르기"의 확장 스캔이나 시나리오 사용 |
| 결함에 소스 위치가 없음 | 플러그인이 안 켜졌거나(`apply: serve` 라 프로덕션 빌드 제외), 컴포넌트 태그(`<MyCard>`)에는 속성을 주입하지 않음 | 개발 서버로 스캔. 매핑은 각 컴포넌트 안의 일반 HTML 요소 기준 |
| 대시보드 API 가 403 (`허용되지 않은 호스트`, `다른 출처의 쓰기 요청`) | `localhost` 가 아닌 호스트 이름으로 열었거나, 다른 웹사이트에서 보낸 쓰기 요청 | 다른 호스트로 열어야 하면 `INSPECTOR_ALLOWED_HOSTS` 에 추가. 대시보드 화면, MCP, CLI, 확장은 영향 없음 |
| 대시보드 500, `does not provide an export named …` | 패키지를 재빌드했는데 대시보드가 옛 모듈을 들고 있음 | 대시보드 프로세스 재시작 |
| 적용이 409 `제안 이후 파일이 바뀌었습니다` | 제안 뒤에 파일이 수정됨 | 컨텍스트를 다시 읽고 패치를 새로 제안 |
| 재측정이 들쭉날쭉하거나 항상 실패 | HMR 이 `INSPECTOR_SETTLE_MS`(기본 800ms) 안에 끝나지 않음, 개발 서버가 내려감 | `INSPECTOR_SETTLE_MS=2000` 등으로 늘리기, 앱 개발 서버 상태 확인 |
| `browserType.launch: Executable doesn't exist` | Chromium 미설치 | `pnpm dlx playwright@1.56.1 install chromium` 또는 `INSPECTOR_CHROMIUM_PATH` |
| 포트 충돌(`strictPort`, `EADDRINUSE`) | 5173/3000 이미 사용 중 | 다른 포트로 띄우고 스캔 URL, `INSPECTOR_DASHBOARD_URL` 을 맞춤 |
| `시나리오 steps[N] (click …) 실패` (CLI 종료 코드 2, 대시보드 422) | 셀렉터가 5초 안에 화면에 나타나지 않음(오타, 앱이 아직 안 뜸, 다른 URL) | 시나리오의 URL 과 셀렉터를 개발자 도구로 확인. 열린 뒤에만 생기는 요소는 `wait selector` 로 기다리기 |
| 적용이 409 `…시나리오(s_…)를 찾을 수 없어 재측정할 수 없습니다` | 시나리오가 저장되지 않은 채 시나리오 키만 가진 결함 기록(예: 저장소를 지웠거나 다른 곳에서 가져옴) | 같은 시나리오로 다시 스캔한 뒤 새 결함으로 패치 제안 |
| 확장: `실패: Failed to fetch` | 대시보드에 연결하지 못함. Nuxt 개발 서버가 환경에 따라 IPv6(`::1`)로만 떠서 `http://127.0.0.1:3000` 이 거부됨 | 팝업의 대시보드 URL 을 `http://localhost:3000` 으로 입력 |
| 확장: `탐지기를 실행하지 못했습니다` | 탭을 확장이 열기 전에 로드했거나 `localhost`/`127.0.0.1` 이 아님 | 페이지 새로고침 후 재시도, 로컬 주소로만 사용 |
| `pnpm bench` 가 토큰 계측에서 실패 | `ANTHROPIC_API_KEY`(또는 `ant auth login`) 없음 | 키 설정 또는 `INSPECTOR_BENCH_ESTIMATE=1` |

---
