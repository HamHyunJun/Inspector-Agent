# 운영 가이드

내 프로젝트에 붙여 두고 매일 쓰는 방법의 상세입니다. 처음 설치와 기본 사용은 [README](../README.md)에 있고, 여기에는 일상 루프, 결함별 대응, 자율 모드, 스캔 방법, CI, 데이터 관리, 오탐 대응, 문제 해결을 모았습니다.

## 누가 무엇을 하나

| 구성 요소 | 하는 일 | 언제 쓰나 |
| --- | --- | --- |
| 내 앱의 개발 서버 | Vite 플러그인이 요소에 `data-ia-src="파일:라인:컬럼"` 을 주입 (개발 서버 전용) | 개발하는 동안 |
| 엔진 (`@inspector-agent/engine`) | 결함·패치 저장, 스캔, 컨텍스트, 패치 제안·적용·재측정·자동 롤백. **내 프로젝트 파일을 실제로 쓰는 유일한 코드** | MCP·CLI 가 실행될 때 |
| MCP 서버 | Claude Code 가 쓰는 도구(`scan_page`, `list_defects`, `get_defect_context`, `propose_patch`, `get_patch_status`, `apply_patch`)와 `/ia` 명령 | Claude Code 세션 동안 (자동 실행) |
| `inspector-agent` CLI | `fix <url>`(스캔 → 규칙 기반 제안 → 승인 → 적용·재측정), `apply <패치 id>`(AI 제안을 사람이 승인), `rollback <패치 id>`(적용된 패치 되돌리기) | 필요할 때 |
| `inspector-scan` CLI | 스캔만 하고 종료 코드로 판정. CI 용 | 필요할 때 / CI |

에이전트는 파일을 직접 고치지 않습니다. **제안(`propose_patch`) → 사람이 승인(또는 자율 모드) → 엔진이 백업·반영·재측정** 순서로만 파일이 바뀌고, 재측정에 실패하면 엔진이 원본으로 되돌립니다.

## 일상 운영 루프

1. **켜기**: 내 앱 개발 서버. Claude Code 를 쓰면 MCP 서버는 자동으로 뜹니다.
2. **스캔**: 화면을 만들거나 고친 뒤 `/ia scan`(또는 `npx inspector-scan <url>`)을 실행합니다. 기본 뷰포트는 320/375/414/768/1024/1280px 6개이고, 눌러야 열리는 UI 는 자동 탐색이 열어 봅니다. 같은 소스 위치·뷰포트의 결함은 URL 이 달라도 한 건으로 묶여 보고됩니다.
3. **우선순위 정하기**: 먼저 `high`(24px 이상 넘침, 페이지 가로 스크롤 유발, 가려짐 80% 이상, 포커스 이탈)를 처리합니다. 뷰포트별 결함은 같은 파일을 고치면 같이 사라지고, 다른 URL 의 해소는 그 URL 을 다시 스캔해 확인하세요. 한 원인이 같은 줄의 뒤쪽 요소를 밀어낸 경우(예: 긴 이름이 배지를 밀어냄)는 원인 하나로 묶이고 뒤쪽 요소는 **연쇄 결함 N건**으로 표시되니, 원인만 고치면 됩니다.
4. **패치 만들기** (둘 중 하나)
   - **에이전트**: `/ia scan` 이 `get_defect_context` 로 압축 컨텍스트(수치, 템플릿 스니펫, 노드·부모·자식 CSS 규칙, 진단)를 읽고 `propose_patch` 로 제안합니다.
   - **규칙 기반**: `npx -y @inspector-agent/engine fix <url>`. 선언만으로 고칠 수 있는 진단(오버플로우, 말줄임, z-index 부족)에만 동작합니다.
5. **검토하고 적용**: diff 를 읽고 승인하면 엔진이 백업 → 반영 → `INSPECTOR_SETTLE_MS` 만큼 HMR 대기 → 같은 URL·뷰포트로 재측정합니다. 통과하면 결함이 `resolved`, 실패하면 자동 롤백되고(`open`) 사유가 남습니다. 필요 없는 제안은 적용하지 않으면 됩니다.
6. **실패했을 때**: 검증 문구(예: `오버플로우가 180px → 42px로 남아 있습니다`, `새 결함 1건이 생겼습니다`)를 에이전트에게 그대로 주고 다시 제안하게 합니다. 복합 원인(예: flex item `min-width: auto` + 자식 `nowrap`)은 한 번에 둘 다 고쳐야 통과합니다.
7. **롤백**: 통과한 패치도 `npx -y @inspector-agent/engine rollback <패치 id>` 로 되돌릴 수 있습니다(백업에서 복구). 적용 뒤 파일을 더 고쳤다면 그 변경을 지우지 않도록 거부합니다.
8. **해소 확인과 커밋**: 같은 URL·뷰포트를 다시 스캔하면 사라진 `open` 결함이 `resolved` 로 바뀝니다. `git diff` 로 최종 변경을 한 번 더 확인하고 커밋합니다.

## 결함 종류별 대응

| 종류 | 무엇이 문제인가 | 자동(규칙) 패치 | 처리 요령 | 재측정 통과 기준 |
| --- | --- | --- | --- | --- |
| `overflow-x` | 박스·텍스트가 부모 콘텐츠 영역을 넘음 | 대부분 가능 | 진단 1순위(`flex-item-min-width`, `flex-shrink-disabled`, `fixed-width`, `unbreakable-text`…)를 먼저 시도. 자식이 원인이면 노드와 자식을 함께 수정 | 넘친 px 가 0, 새 결함 없음 |
| `overflow-x` (`squished`) | flex 줄 안의 아이콘·이미지가 공간이 모자라 한쪽 축으로만 줄어 비율이 깨짐 (넘침·잘림은 없음) | 가능 | `flex-shrink-disabled`: 그 요소에 `flex-shrink: 0` | 찌그러진 px 가 0, 새 결함 없음 |
| `overflow-x` (`doc-width`) | 페이지가 가로로 스크롤되는데 뷰포트 너비로만 그려진 전체 너비 블록(헤더·푸터)의 배경·우측 여백이 끊김. 넘치게 만든 요소의 결과라 그 요소와 함께 보고됨 | 불가능(선언 없음) | `document-overflow-source`: 함께 보고된 가로 오버플로우 원인을 먼저 고침. 의도된 가로 스크롤이면 `overflow-x: auto` 컨테이너로 가둠. 래퍼를 `min-width: fit-content` 로 넓히면 절대 위치 팝업이 화면 밖으로 밀리고 body 를 넘는 새 결함이 생김 | 모자란 px 가 0, 새 결함 없음 |
| `overflow-x` (`overlap`) | 흐름 안의 글·이미지·컨트롤이 다른 덩어리 위에 얹힘(음수 margin 등). 절대/고정/sticky 위치, 변환, 그리드 명시 배치, 고정 높이 컨테이너 넘침(세로 오버플로우로 보고)은 제외 | 음수 margin 이 원인일 때만 가능 | `sibling-overlap`: 음수 margin 을 0 으로. 그 밖의 원인은 소스에서 직접 확인 | 겹친 px 가 0, 새 결함 없음 |
| `overflow-x` (`distorted`) | `<img>` 가 원본 비율과 다른 박스에 `object-fit: fill` 로 그려져 늘어남. flex 줄에서 줄어든 이미지는 `squished` 로 보고 | 가능 | `image-aspect-ratio`: `object-fit: cover`(잘려도 됨) 또는 `contain`, 박스 높이를 맞출 수 있으면 `height: auto` | 늘어난 px 가 0, 새 결함 없음 |
| `overflow-x` (`tap-target`) | 768px 이하에서 24px 보다 작은 버튼·링크·입력이 다른 타겟과 붙어 있음(WCAG 2.5.8 간격 예외 적용). 문장 속 인라인 링크, 비활성 컨트롤, 기본 체크박스·라디오, 모달 밑에 깔린 요소는 제외 | 가능 | `tap-target-size`: `min-width`/`min-height` 24px 이상(주요 버튼은 44px 권장) 또는 타겟 사이 간격 확보 | 모자란 px 가 0, 새 결함 없음 |
| `overflow-x` (`stacked-text`) | 칸이 좁아 단어가 한두 글자씩 세로로 줄바꿈됨(한 줄 평균 2글자 이하, 3줄 이상) | 가능 | `stacked-text`: `word-break: keep-all` + `min-width: min-content`. 칸이 좁아진 원인(고정 너비, flex 축소)도 확인 | 쪼개짐이 사라짐, 새 결함 없음 |
| `overflow-x` (`broken-image`) | `<img>`·`<picture>` 소스가 로드에 실패해 빈 사각형·대체 텍스트만 보임 | 불가능(선언 없음) | `image-load-failed`: `src`/`srcset` 경로, 파일 존재, 서버 응답 확인. `<picture>` 는 그 화면 폭에서 고른 `<source>` 가 틀렸을 수 있음 | 결함이 사라짐 |
| `overflow-x` (`tiny-text`·`tight-leading`·`input-zoom`·`text-orphan`) | 12px 미만 글자 · 줄 높이가 글자보다 작은 여러 줄 문단 · 16px 미만 입력창(iOS 확대) · 문단 끝 한두 글자 | 가능 | `min-font-size` `font-size: 12px` · `line-height-tight` `line-height: 1.4` · `input-font-size` `font-size: 16px` · `text-orphan` `text-wrap: pretty` | 결함이 사라짐, 새 결함 없음 |
| `overflow-x` (`blurry-image`·`oversized-image`·`long-line`) | 필요한 픽셀보다 작은 원본(화면 배율 반영) · 필요의 3배 넘는 원본 · 한 줄 100자 초과 | 이미지는 불가능(파일 교체), 긴 줄은 가능 | `image-resolution`: 더 큰 원본이나 `srcset`. `line-length`: `max-width: 75ch` | 결함이 사라짐 |
| `overflow-x` (`low-contrast`·`border-contrast`) | 글자 대비 < 4.5:1(큰 글자 3:1) · 입력창 경계 대비 < 3:1. 배경 이미지·그라디언트는 판정하지 않음 | 가능 | `text-contrast`·`border-contrast`: 같은 색조로 진하게 만든 색을 제안 | 대비가 기준 이상 |
| `overflow-x` (`icon-misaligned`·`text-off-center`·`uneven-cards`) | 아이콘·한 줄 글자 중심이 4px 이상 어긋남 · 버튼 안 글자 쏠림 · 같은 줄 카드 높이 차 ≥ 24px | 아이콘 정렬·카드 높이는 가능, 버튼 쏠림은 불가능(padding 확인) | `align-items-center`, `equal-height-cards`(`align-items: stretch`), `text-centering` | 결함이 사라짐 |
| `overflow-x` (`click-blocked`·`fake-button`·`hover-only`·`tabindex-positive`) | 내용 없는 투명 레이어가 버튼을 덮음 · `cursor: pointer` 인 div(포커스 불가) · `:hover` 로만 열리는 메뉴 · 양수 tabindex | 불가능(구조 변경) | `click-blocked`: 레이어에 `pointer-events: none`. `fake-button`: `<button>` 으로 교체. `hover-only-menu`: `:focus-within` 추가. `tabindex-positive`: 제거 | 결함이 사라짐 |
| `overflow-x` (`scroll-locked`·`layout-shift`) | 모달이 없는데 body/html overflow·fixed 로 스크롤이 막힘 · 로드 중 누적 레이아웃 이동 ≥ 0.1 | `scroll-locked` 만 가능(`overflow-y: auto`) | 모달을 닫을 때 잠금을 풀었는지 확인. `layout-shift`: `<img>` 에 width/height, 늦게 뜨는 영역의 자리 확보 | 결함이 사라짐 |
| `overflow-x` (`focus-ring-missing`·`focus-covered`·`focus-order`) | 실제 Tab 키로 확인: 포커스 표시 없음 · 고정 요소가 포커스된 요소를 가림 · 화면 순서를 거스른 이동 | 불가능 | `focus-indicator`: `:focus-visible` 규칙 추가(고대비를 위해 `outline: 2px solid transparent` 병행). `focus-scroll-padding`: html 에 `scroll-padding-*`. `focus-order`: DOM 순서를 화면 순서에 맞춤 | 결함이 사라짐 |
| `overflow-x` (`fixed-overlap`·`fixed-hog`·`sticky-inert`·`z-index-inert`·`corner-clipped`·`scroll-end-flush`·`nested-scroll`·`viewport-height`) | 고정 요소끼리 겹침 · 화면의 35% 초과 차지 · 붙지 않는 sticky · 효과 없는 z-index · overflow 가 배지를 자름 · 스크롤 목록 끝 여백 없음 · 이중 스크롤 · `100vh` | `fixed-hog`, `z-index-inert`, `corner-clipped`, `scroll-end-flush`, `viewport-height` 가능. 나머지는 구조 확인 필요 | `fixed-layer-size`, `z-index-without-position`(`position: relative`), `overflow-visible-parent`, `scroll-end-padding`, `dynamic-viewport-height`(`100dvh`). `sticky-container-overflow` 는 조상 `overflow: clip` | 결함이 사라짐 |
| `overflow-x` (`empty-space`·`lonely-wrap`·`field-clipped`) | 내용 아래 큰 빈 공간(의도된 가운데 정렬·위치 지정 상자는 제외) · 같은 크기 항목 3+1 줄바꿈 · placeholder·선택값 잘림 | `empty-space` 만 가능 | 나머지는 항목 너비·입력창 너비를 직접 조정 | 결함이 사라짐 |
| `overflow-x` (`resource-failed`·`mixed-content`·`font-failed`·`console-error`·`anchor-missing`) | 404 이거나 CSS 가 아닌 응답을 받은 스타일시트 · HTTPS 페이지의 HTTP 리소스 · 로드 실패한 웹폰트 · 렌더 중 콘솔 에러 · 대상 없는 `#앵커` | 불가능(경로·서버·소스 확인) | 각 진단의 안내(`resource-load-failed`, `mixed-content`, `font-load-failed`, `console-error`, `anchor-target`)를 따름 | 결함이 사라짐 |
| `overflow-y` | 높이가 고정된 컨테이너(`overflow-y: visible`) 밖으로 흐름 안 콘텐츠가 넘쳐 아래 요소와 겹침. 스크롤·잘림 컨테이너, 절대 위치 팝업, float 는 제외 | 대부분 가능 | `fixed-height`: `height: auto` + `min-height`(현재 높이를 유지). 높이를 유지해야 하면 `vertical-scroll`: `overflow-y: auto` | 넘친 px 가 0, 새 결함 없음 |
| `clipped-text` | `overflow: hidden` 인데 `text-overflow: ellipsis` 가 없어 글자가 잘렸다는 표시 없이 사라짐. input, 말줄임, line-clamp, sr-only, 캐러셀 카드는 제외 | 가능 | `text-ellipsis`: 한 줄 라벨이면 말줄임(+ `white-space: nowrap`). 내용이 중요하면 `text-wrap`: `white-space: normal` + `overflow-wrap: anywhere` | 잘린 px 가 0 이거나 말줄임이 적용됨 |
| `occluded` | 모달·드롭다운 같은 팝업이 다른 요소에 가려짐 | `z-index-too-low` 만 가능 | `stacking-context-trap` 은 z-index 를 올려도 소용없음. 갇힌 조상의 `transform`/`opacity`/`filter` 등을 없애거나 팝업을 `<Teleport to="body">` 로 옮김. `overflow-clipped-popup` 은 자르는 조상의 `overflow` 를 풀거나 팝업을 body 로 이동 | 가려진 비율이 **0%** (일부만 풀려도 실패) |
| `focus-escape` | 열린 모달에서 Tab/Shift+Tab 으로 포커스가 모달 밖으로 나감 | 불가능(JS 필요) | 모달 안 `keydown` 핸들러로 첫/마지막 요소를 순환시키거나 배경에 `inert`, 네이티브 `<dialog>.showModal()` 사용. `aria-modal` 은 포커스를 가두지 않음 | 앞·뒤 **두 방향 모두** 모달 안에 머묾 |

자동 패치가 불가능한 결함은 에이전트가 구조를 바꿔 제안해야 합니다.

## 승인 모드와 자율 모드

| | 승인 모드 (기본) | 자율 모드 (`INSPECTOR_ALLOW_AGENT_APPLY=1`) |
| --- | --- | --- |
| 에이전트가 하는 일 | 제안까지 | 제안 → `apply_patch` 로 적용 → 재측정 결과를 보고 재제안 |
| 파일 반영 | 사람이 승인: 승인 창을 지원하는 클라이언트는 그 창(diff 표시), 아니면 터미널 `inspector-agent apply` | 사람 승인 없이 바로 반영 |
| 켜는 방법 | 기본값 | `.mcp.json` 의 `env` 에 `"INSPECTOR_ALLOW_AGENT_APPLY": "1"` 추가 후 Claude Code 재시작 |

자율 모드는 켜기 전에 아래를 지키는 것을 권장합니다.

- **전용 브랜치에서, 작업 트리를 깨끗하게 한 뒤** 켭니다. 끝난 뒤 `git diff` 가 곧 에이전트가 한 일의 전부입니다.
- 엔진의 **안전장치**는 이렇습니다: 모든 경로가 `INSPECTOR_PROJECT_ROOT` 안으로 제한되고 `node_modules` 와 루트 밖을 가리키는 심볼릭 링크는 거부, 반영 전 백업, 제안 이후 파일이 바뀌었으면 적용 거부(409), 재측정 실패 시 자동 롤백.
- 하지만 **검증은 "대상 결함이 사라졌고, 같은 뷰포트에 새 결함이 없다"까지만** 봅니다. 다른 페이지, 다른 뷰포트, 열려야 보이는 UI 에서 생긴 회귀와 디자인 의도는 못 봅니다. 자율 모드가 끝나면 사람이 diff 를 훑고, 모든 뷰포트로 다시 스캔하세요.
- **시도 횟수 제한은 코드에 없습니다.** 에이전트에게 "결함당 최대 3회, 그래도 안 되면 멈추고 보고"처럼 지시하세요(벤치마크 실측도 이 조건이었습니다).
- 대상은 로컬 개발 서버와 로컬 프로젝트 루트입니다. 원격·프로덕션 URL 을 스캔할 수는 있어도 거기에는 `data-ia-src` 가 없어 소스 매핑이 안 됩니다.

## 스캔 방법

| 방법 | 어떻게 | 특징 |
| --- | --- | --- |
| MCP `scan_page` | `/ia scan` 또는 에이전트에게 "스캔해줘" | 스캔 → 패치 제안까지 한 번에 진행 |
| `inspector-scan` | `npx inspector-scan <url> [--viewports 375,768x1024] [--fail-on high] [--summary 파일] [--scenario 파일.json] [--no-explore]` | 종료 코드·마크다운 요약. CI 용 |
| `inspector-agent fix` | `npx -y @inspector-agent/engine fix <url>` | 스캔 후 규칙 기반 자동 수정까지 |

**자동 탐색(기본 켜짐).** 시나리오 없이 스캔해도 작은 화면부터 큰 화면까지(320/375/414/768/1024/1280px) 재 보고, 페이지에서 눌러 볼 만한 것(`aria-expanded`/`aria-haspopup` 트리거, 툴팁, 탭, 아코디언, 일반 버튼, CSS `:hover` 로만 열리는 메뉴)을 **스스로 찾아 hover/click** 한 뒤 열린 상태까지 검사합니다. 열었을 때만 생기는 결함(툴팁·팝오버가 화면 밖으로 나감, 모달 가려짐·포커스 이탈 등)이 "자동 탐색: click …" 이름의 상태로 따로 기록되고, 각 상태는 그 상태를 다시 만드는 시나리오로 저장되어 패치 후 재측정도 같은 상태에서 합니다. 안전을 위해 삭제·결제·제출·로그아웃처럼 보이는 버튼과 제출 버튼은 누르지 않고, 탐색 중 `GET` 이 아닌 요청은 차단하며, 새 창·내려받기·`confirm` 창은 막습니다. 끄려면 CLI `--no-explore`, API `explore: false`. 직접 시나리오를 주면 그 시나리오가 우선이라 탐색하지 않습니다.

**로그인이 필요하거나 데이터가 있어야 그려지는 화면은 시나리오로 스캔하세요.** 헤드리스 스캔은 새 브라우저로 URL 만 열기 때문에 데이터가 있어야 그려지는 화면은 빈 상태로 검사되고, 이때 "결함 0건"은 **안전하다는 뜻이 아닙니다.** **시나리오**는 스캔 전에 `localStorage`/`sessionStorage`/쿠키 시드를 심고 클릭·입력·대기 단계를 실행하는 JSON 이며, MCP, CLI, 패치 후 재측정이 같은 파일을 그대로 씁니다.

```bash
npx inspector-scan http://localhost:5173 --scenario docs/scenarios/example-seed.json
```

- 형식, 한도, 내 앱의 시나리오 만드는 법은 [`docs/scenarios/README.md`](scenarios/README.md), 예시는 `docs/scenarios/` 에 있습니다.
- 시나리오 스캔의 결함은 시나리오 키가 id 에 섞여 같은 URL 의 일반 스캔과 별개로 기록됩니다(서로를 `resolved` 로 바꾸지 않음). 패치 후 재측정은 저장된 같은 시나리오로 합니다. 시나리오 없이 재측정하면 닫힌 메뉴를 재서 고치기 전에도 "통과"가 나오기 때문입니다.
- **비밀번호, 토큰, 실제 세션 쿠키는 넣지 마세요.** 시나리오는 `.inspector-agent/store.json` 에 평문으로 저장됩니다.

## CI 운영

이 저장소에는 워크플로가 둘 있습니다.

- `.github/workflows/ci.yml` (모든 PR, `main`): 타입체크, 단위 테스트, 탐지 회귀 벤치마크(`pnpm bench`, 근사 토큰 모드). 정답표·대조군의 불변 조건(재현율·정밀도 100%, 대조군 오탐 0건, 1280px 결함 0건)이 깨지면 실패하므로 탐지 규칙을 바꾸는 PR 이 회귀를 만들면 막힙니다.
- `.github/workflows/layout-scan.yml` (수동 실행): playground 를 띄워 스캔하고, 기준 이상 결함이 있으면 실패하며 결과 표를 job summary 에 남깁니다. **이 저장소의 playground 는 벤치마크용 결함이 일부러 심겨 있어 항상 실패하는 것이 정상**이라 PR 마다 돌리지 않습니다. 내 앱에 쓸 때는 아래처럼 바꾸고 트리거에 `pull_request` 를 추가하세요.

내 앱에 쓰려면 위 단계처럼 개발 서버를 띄우고 `inspector-scan` 을 실행하세요.

```yaml
- run: pnpm start &                      # 내 앱 개발 서버 (플러그인이 켜진 개발 모드여야 소스 위치가 나옴)
- run: npx wait-on http://localhost:3000
- run: npx inspector-scan http://localhost:3000 --fail-on high --summary "$GITHUB_STEP_SUMMARY"
```

- **종료 코드**: `0` 통과 · `1` 기준 초과 · `2` 사용법 오류 또는 스캔 실패.
- **도입 순서 권장**: 처음에는 `--fail-on high` 로 시작해 기존 결함을 정리한 뒤 `medium` → `low` 로 낮춥니다. 처음부터 `low` 로 켜면 기존 결함 때문에 모든 PR 이 막힙니다.
- 요약은 실패해도 항상 남습니다. 표의 **위치**(`파일:라인`)로 바로 이동해 고치면 됩니다.
- CI 도 아래 "스캔 방법"의 한계를 그대로 가집니다. 빈 상태 화면은 CI 에서도 빈 상태로 검사됩니다.
- PR 코멘트 게시와 기존 결함 기준선(허용 목록) 파일은 아직 없습니다.
- 내 앱의 CI 에서는 `npm install -D @inspector-agent/verifier` 후 `npx inspector-scan <url> --fail-on high` 만으로 됩니다.

## 데이터와 상태 관리

- **저장 위치**: `INSPECTOR_DATA_DIR`(기본 `<프로젝트 루트>/.inspector-agent`)의 `store.json`(결함·패치·재측정 기준선)과 `backups/<패치id>.bak`(적용 직전 원본). 이 폴더는 스스로 git 에서 제외됩니다. 사람이 열어 볼 수 있는 JSON 이고, 폴더를 지우면 초기화됩니다(프로젝트 파일에는 영향 없음). 처리가 끝난 지 7일이 지난 패치 기록과 백업(거절, 롤백, 자동 롤백된 실패)은 스캔할 때 자동으로 정리되고, 소스에 적용된 패치는 롤백 기준이라 지우지 않습니다.
- **결함 상태**: `open`(미해결) · `patched`(자동 롤백 없이 파일에 남은 상태) · `resolved`(해결). 같은 URL·뷰포트를 재스캔했는데 사라진 `open` 결함만 `resolved` 가 되고, 해결된 결함이 다시 나타나면 `open` 으로 돌아옵니다.
- **패치 상태**: `proposed`(검토 대기) · `verified`(검증 통과) · `failed`(검증 실패, 보통 자동 롤백됨) · `rolled-back` · `rejected`.
- **여러 프로젝트를 다룰 때**: 프로젝트마다 자기 폴더의 `.inspector-agent/` 를 쓰므로 따로 할 일이 없습니다.
- **탐지기 규칙이나 패키지를 고친 뒤에는** `pnpm build` 를 하고 Claude Code 를 재시작하세요. `npx` 로 받아 쓴다면 `npx clear-npx-cache` 후 재시작합니다.

## 오탐·미탐 대응

- **일시적으로 제외**: 검사에서 빼고 싶은 요소(또는 그 하위 전체)에 `data-ia-ignore` 속성을 붙입니다. 오버플로우, 가려짐, 모달 포커스 검사에 모두 적용됩니다. 의도한 겹침이나 스크롤이면 이유를 주석으로 남기세요.
- **오탐을 발견했다면**: 재현 컴포넌트를 `apps/playground/src/components/` 에 **정상 대조군**으로 추가하고 `benchmarks/src/fixtures.ts` 의 `NEGATIVE_CONTROLS` 에 등록한 뒤, 탐지 규칙을 고치고 `pnpm bench` 에서 대조군 오탐 0건이 유지되는지 확인합니다(불변 조건이 깨지면 `pnpm bench` 가 종료 코드 1 로 끝나므로 CI 도 같은 기준으로 실패합니다).
- **탐지 규칙을 고칠 때의 최소 확인**: `pnpm test` → `pnpm typecheck` → `pnpm bench`. 토큰 수까지 재려면 `ANTHROPIC_API_KEY` 가 필요하고, 없으면 `INSPECTOR_BENCH_ESTIMATE=1` 로 근사 모드를 쓸 수 있습니다(결과에 `method: estimate` 표시).
- **알려진 미탐 영역**: 세로 방향의 텍스트 잘림(고정 높이 + `overflow: hidden` 으로 글줄이 잘리는 경우), 텍스트 대비 등 접근성 일반, 시나리오에 단계로 정의하지 않은 인터랙션 후의 UI, `transform` 이 걸린 요소의 박스 오버플로우. [로드맵](overview.md#한계와-로드맵)을 참고하세요.

## 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/mcp` 에서 `CONNECTION_CLOSED` | MCP 서버가 시작되지 못함 | Claude Code 재시작, 계속되면 `npx clear-npx-cache` |
| 모든 도구가 `package.json 이 없습니다` 라고 답함 | MCP 클라이언트가 프로젝트가 아닌 폴더에서 서버를 시작함 | `.mcp.json` 의 `env` 에 `INSPECTOR_PROJECT_ROOT` 를 프로젝트 폴더로 지정 |
| 결함 컨텍스트에 템플릿·CSS 규칙이 비어 있음 | `INSPECTOR_PROJECT_ROOT` 가 `data-ia-src` 경로의 기준(프로젝트 루트)과 다름, 또는 플러그인이 옛 버전 | 루트를 `package.json` 이 있는 폴더로 지정, 플러그인을 최신으로 올리고 앱 개발 서버 재시작 |
| 화면은 깨져 보이는데 스캔은 0건 | 빈 상태/로그인 필요/닫힌 팝업을 검사함, 또는 `data-ia-ignore` 로 제외됨 | 시나리오 사용 |
| 결함에 소스 위치가 없음 | 플러그인이 안 켜졌거나(개발 서버 전용), 컴포넌트 태그(`<MyCard>`)에는 속성을 주입하지 않음 | 개발 서버로 스캔. 매핑은 각 컴포넌트 안의 일반 HTML 요소 기준 |
| 적용이 `제안 이후 파일이 바뀌었습니다` 로 거절됨 | 제안 뒤에 파일이 수정됨 | 컨텍스트를 다시 읽고 패치를 새로 제안 |
| 적용이 `승인 창을 띄울 수 없어` 로 거절됨 | 클라이언트가 승인 창을 지원하지 않음 | 터미널에서 `npx -y @inspector-agent/engine apply <패치 id>` |
| 재측정이 들쭉날쭉하거나 항상 실패 | HMR 이 `INSPECTOR_SETTLE_MS`(기본 800ms) 안에 끝나지 않음, 개발 서버가 내려감 | `INSPECTOR_SETTLE_MS=2000` 등으로 늘리기, 앱 개발 서버 상태 확인 |
| `browserType.launch: Executable doesn't exist` | Chromium 미설치 | `npx playwright@1.56.1 install chromium` 또는 `INSPECTOR_CHROMIUM_PATH` |
| 포트 충돌(`strictPort`, `EADDRINUSE`) | 개발 서버 포트가 이미 사용 중 | 다른 포트로 띄우고 스캔 URL 을 맞춤 |
| `시나리오 steps[N] (click …) 실패` | 셀렉터가 5초 안에 화면에 나타나지 않음(오타, 앱이 아직 안 뜸, 다른 URL) | 시나리오의 URL 과 셀렉터를 개발자 도구로 확인. 열린 뒤에만 생기는 요소는 `wait selector` 로 기다리기 |
| 적용이 `…시나리오(s_…)를 찾을 수 없어 재측정할 수 없습니다` 로 거절됨 | 시나리오가 저장되지 않은 채 시나리오 키만 가진 결함 기록(예: 저장소를 지웠거나 다른 곳에서 가져옴) | 같은 시나리오로 다시 스캔한 뒤 새 결함으로 패치 제안 |
| `pnpm bench` 가 토큰 계측에서 실패 | `ANTHROPIC_API_KEY`(또는 `ant auth login`) 없음 | 키 설정 또는 `INSPECTOR_BENCH_ESTIMATE=1` |
