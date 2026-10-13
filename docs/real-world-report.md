# 실서비스 적용 리포트: Camping-Joy

탐지 규칙은 수정하지 않았다. 관찰한 그대로만 기록한다.

## 1. 적용 대상과 방법

| 항목 | 내용 |
|---|---|
| 대상 | `/Users/hyunjun/Camping-Joy` (Nuxt 4.6, `ssr: false`, Pinia + localStorage 영속) |
| 개발 서버 | `pnpm dev --port 5174` |
| 대시보드 | `INSPECTOR_PROJECT_ROOT=/Users/hyunjun/Camping-Joy`, 포트 3100 (기존 3000번은 playground 용이라 건드리지 않음) |
| 뷰포트 | 375×812, 768×1024, 1280×800 |
| 스캔 페이지 | `/`, `/gear`, `/camps/past`, `/camps/{c1,c2}/{info,members,schedule,distribute,result}` (13개 URL × 3 = 39회) |
| 육안 대조 | 같은 39장을 Playwright 로 fullPage 스크린샷 후 직접 확인 |

### 플러그인 적용 (Camping-Joy 쪽 변경 3개 파일)

1. `pnpm add -D link:../Inspector-Agent/packages/vite-plugin` (로컬 링크. `package.json`, `pnpm-lock.yaml` 변경)
2. `nuxt.config.ts`
   ```ts
   import inspectorAgent from '@inspector-agent/vite-plugin'
   export default defineNuxtConfig({
     vite: { plugins: [inspectorAgent()] }
   })
   ```
   Nuxt 는 `vite.plugins` 로 넘기면 된다. `enforce: 'pre'` 라 Nuxt 의 vue 플러그인보다 먼저 실행된다.
3. 개발 서버에서만 주입된다 (`apply: 'serve'`). 빌드 산출물에는 `data-ia-src` 가 들어가지 않는다.

### 스캔 방식에 대한 주의

- 빈 상태(localStorage 비어 있음)로는 **13개 URL 전부 결함 0건**이었다. 이 앱은 데이터가 있어야 UI 가 그려진다.
- 그래서 localStorage 에 현실적인 데이터를 심었다: 캠핑 3개, 멤버 4명, 필요 장비 8개, 일정 9줄. 긴 한글 이름, 긴 영문 하이픈 단어, 긴 URL 형태 문자열을 일부러 섞었다.
- 대시보드 `/api/scan` 은 URL 만 받아 빈 상태로 열기 때문에 쓰지 못했다. 같은 탐지기(`detector.global.js`)를 Playwright 로 주입하고 결과를 `/api/scans` 로 보냈다.
- **데이터를 바꾸면 결과도 바뀐다.** 아래 수치는 이 시드 데이터에 한정된다.

## 2. 결과 요약

대시보드에 16건이 들어갔다 (같은 원인이 URL·뷰포트별로 중복 집계됨).

| 구분 | 건수 | 비고 |
|---|---|---|
| 진짜 결함 (정탐) | 1개 원인 | `distribute.vue` 멤버 알약, 1280px 만. 대시보드 4건 (이름 2 + 배지 2, c1/c2 중복) |
| 오탐 | 3개 원인 | 회전한 chevron. 대시보드 12건 |
| 미탐 (확정) | 0건 | 육안 대조에서 탐지 규칙의 대상 범위 안인데 놓친 것은 찾지 못함 |
| 미탐 (후보·범위 밖) | 2건 | 아래 4번 표 |

## 3. 오탐 (실제로는 문제없는 것)

| # | 위치 | 뷰포트 | 탐지 내용 | 왜 오탐인가 | 확신도 |
|---|---|---|---|---|---|
| F1 | `app/pages/index.vue:41` `span.chevron.down` | 375/768/1280 | box +7px | `transform: rotate(90deg)` 로 회전한 `›` 글리프. 레이아웃 박스(10px)는 부모 안에 있는데, `getBoundingClientRect` 는 변환 후 사각형(24×9.9)을 돌려줘서 부모 콘텐츠 영역을 넘는 것처럼 보인다. 스크린샷에서 오른쪽 끝 정상 | 높음 |
| F2 | `app/components/SelectMenu.vue:12` `span.select-chevron` | 375/768/1280 | box +5.9px | `transform: rotate(90deg)` (CSS L133). 스크린샷에서 문제 없음. F1 과 같은 원인 | 높음 |
| F3 | `app/components/PersonGearCard.vue:12` `span.chevron` | 375/768/1280 | box +2.1px | `transform: translateY(-3px) rotate(45deg)`. 스크린샷에서 문제 없음. F1 과 같은 원인 | 높음 |

공통 원인: 탐지기가 `getBoundingClientRect` (변환 반영) 로 `box` 모드를 판정한다. `rotate`, `translate`, `scale` 이 걸린 요소는 레이아웃과 무관하게 부모 밖으로 잡힌다. 세 건 모두 severity `low` (≤7px, 페이지 가로 스크롤 없음)라 분류기가 일부 걸러내는 효과는 있었다. `documentOverflowPx` 는 전 페이지 0이었다.

### 중복 집계 (오탐은 아니지만 노이즈) — 해결됨

| # | 내용 |
|---|---|
| D1 | **해결**: 같은 부모의 같은 줄에서 앞 형제가 넘쳐 뒤 형제를 부모 콘텐츠 밖으로 밀어내면 앞 형제 하나로 묶고 뒤 형제는 `metrics.cascaded`(연쇄 결함)로 남긴다. 대시보드·MCP·에이전트 컨텍스트에 "연쇄 결함 N건"으로 표시. 재현: playground `MemberRow.vue`. 원래 증상: `distribute.vue` 의 한 원인(`Alexandria-Montgomery` 이름이 알약을 넘음)이 `span.name` (+44px) 과 `span.badge` (+74px) 두 건으로 나뉜다. 배지는 이름이 밀어낸 결과다. 후보 중복 제거가 "조상-자손이며 overflowPx 차이 ≤ 2px" 일 때만 동작해서 형제 관계는 합쳐지지 않는다 |
| D2 | **해결**: 대시보드 목록과 MCP `list_defects` 가 fingerprint(종류, 소스 위치, 뷰포트)로 URL 과 무관하게 한 그룹으로 묶고 발생 URL 목록을 보여 준다. 상세 화면에는 "같은 위치의 다른 URL"이 나온다. 저장소의 결함 id 는 URL 별로 그대로라 URL 별 검증·기준선은 유지된다. 재현: playground `?page=members`. 원래 증상: 같은 컴포넌트 결함이 URL 이 다르면 별개 id 로 쌓인다 (`/camps/c1/…`, `/camps/c2/…`). 위 16건 중 `SelectMenu` 4건, `distribute` 4건이 이 경우다 |

## 4. 정탐 (참고)

| # | 위치 | 뷰포트 | 내용 | 육안 확인 |
|---|---|---|---|---|
| T1 | `app/pages/camps/[campId]/distribute.vue:17` `.name`, `:18` `.badge` | 1280 만 | `Alexandria-Montgomery` (172px) 가 `.member-row` 콘텐츠 폭(128px)을 넘고 배지가 알약 밖으로 밀림 | 1280 스크린샷에서 확인. 375 는 가로 스크롤 목록, 768 은 알약이 넓어 정상 |

## 5. 미탐 (눈으로 보이는데 못 잡은 것)

확정 미탐은 없었다. 아래는 눈에 띄었으나 현재 규칙의 범위 밖이거나 의도된 동작일 가능성이 큰 것이다. 사람이 판단해야 한다.

| # | 위치 | 뷰포트 | 관찰 | 놓친 이유 | 판단 |
|---|---|---|---|---|---|
| M1 | `distribute.vue` 멤버 칩 목록 (`.member-list`, `overflow-x: auto`) | 375 | 세 번째 칩 `Alexandria-M…` 이 잘려 보이고, 네 번째 칩 `박` 은 화면에 없다. 스크롤 단서(그림자·페이드)는 없다 | 조상이 `overflow-x != visible` 이면 의도된 스크롤로 보고 제외하는 규칙 | 결함이라기보다 UX 의심. 탐지 대상이 아닌 게 맞다 |
| M2 | `schedule.vue:67` `input.item-title` | 375 | 긴 일정 제목이 `저녁 바비큐 파티 준비 및 ㅈ` 처럼 말줄임 없이 잘려 보인다 | `<input>` 은 값이 `scrollWidth` 로 잡히지 않고, 규칙은 자식 텍스트 노드(`ownText`) 만 본다 | 입력창의 정상 동작. 수정 대상 아님 |

탐지 규칙 범위 밖이라 **이번 시드로는 검증하지 못한** 항목: 세로 오버플로우, 요소 겹침(z-index), 텍스트 대비·포커스 같은 접근성. `v-if` 로 숨어 있다가 인터랙션 후에 보이는 UI (드롭다운 열림, 공유 시트 `ShareSheet`, 모달) 는 스캔 시점에 DOM 에 없어 한 번도 검사되지 않았다.

보조로 돌려 본 휴리스틱 (검사 코드는 스캔 스크립트와 별도): `overflow: hidden` 으로 잘리는 요소 검색에서는 `sr-only` (의도적 시각 숨김) 와 `<input>` 3개만 나왔다. `.gear-item` 은 카드 44px 안에 이름 43px 로 빠듯하게 들어가며 넘치지 않았다 (1280).

## 6. 적용 중 발견한 통합 문제 (탐지 규칙이 아니라 매핑)

| # | 문제 | 영향 | 근거 |
|---|---|---|---|
| I1 | **소스 경로 접두어 불일치.** Nuxt 4 는 Vite root 를 `srcDir` (`app/`) 로 잡아서, 플러그인이 `relative(root, file)` 로 만든 경로가 `pages/index.vue`, `components/StepNav.vue` 처럼 `app/` 이 빠진다. 대시보드는 `INSPECTOR_PROJECT_ROOT` (= `Camping-Joy`) 기준으로 파일을 찾으므로 존재하지 않는 경로가 된다 | 결함 컨텍스트에 템플릿 스니펫과 SCSS 규칙이 **비어서** 온다. `get_defect_context` 응답이 `nodeRules: [], parentRules: [], childRules: [], tokens.rawFile: 0`. `propose_patch` 도 대상 파일을 읽지 못한다 | `curl localhost:3100/api/defects/d_5b4d6f15/context` |
| I2 | **빈 상태 스캔은 무의미.** 클라이언트 전용 렌더(`ssr: false`) 앱은 URL 만으로는 화면이 비어 있다. `scan_page`/`/api/scan` 이 `localStorage` 시드나 로그인 상태를 줄 방법이 없다 | 실서비스에 붙이면 "결함 0건" 이 정상이라는 착각을 줄 수 있다 | 13개 URL 전부 0건 |
| I3 | **기존 대시보드(3000)와 `.nuxt` 빌드 디렉터리 공유.** 두 번째 인스턴스를 `NUXT_IGNORE_LOCK=1` 로 띄웠다 | 같은 `.nuxt` 를 두 프로세스가 쓴다. 두 대시보드가 같은 `INSPECTOR_DATA_DIR` 를 쓰면 데이터가 섞이므로, 3100 은 `.inspector-agent-camping` 으로 분리했다 | 대시보드 로그 |

I1 의 가장 작은 해결 방향 (이번에는 적용하지 않음): 플러그인이 Vite root 대신 프로젝트 루트(옵션 또는 `nuxt.options.rootDir`) 기준으로 상대 경로를 만들게 하거나, 대시보드에서 `INSPECTOR_PROJECT_ROOT=/Users/hyunjun/Camping-Joy/app` 로 지정하면 우회된다. 후자는 패치가 `app/` 밖의 파일(예: `nuxt.config.ts`)을 못 건드리는 제약이 있다.

## 7. 다음 단계 제안 (미적용)

우선순위순:

1. **I1 수정**: 플러그인의 상대 경로 기준을 프로젝트 루트로. 이게 안 되면 실서비스에서 "탐지 → 패치" 루프가 시작도 못 한다.
2. **F1~F3**: `box` 모드 판정에서 `transform` 이 있는 요소는 레이아웃 기준(`offsetLeft/offsetWidth`) 을 쓰거나 제외. 이번 시드에서 오탐 3개 원인 전부가 이 하나로 해결된다.
3. ~~**D1**: 같은 부모의 형제 결함이 같은 원인일 때 대표 하나로 묶기.~~ (해결, 위 표 참고)
4. **I2**: 스캔 시 `localStorage`/쿠키 시드 또는 사전 스크립트(상호작용) 지정 옵션.

## 8. 재현 방법

- 개발 서버: `cd /Users/hyunjun/Camping-Joy && pnpm dev --port 5174`
- 대시보드: `cd /Users/hyunjun/Inspector-Agent/apps/dashboard && NUXT_IGNORE_LOCK=1 INSPECTOR_PROJECT_ROOT=/Users/hyunjun/Camping-Joy INSPECTOR_DATA_DIR=$PWD/.inspector-agent-camping pnpm exec nuxt dev --port 3100`
- 시드 스캔 스크립트와 스크린샷은 세션 임시 폴더(scratchpad)에 있고 저장소에는 넣지 않았다.
