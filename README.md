# Inspector-Agent

> 실제 브라우저 렌더링에서 깨진 레이아웃을 **규칙으로 찾아내고**, 그 DOM 노드를 **`.vue` 파일의 정확한 라인과 SCSS 규칙**에 연결한 뒤, 에이전트가 만든 패치를 **같은 뷰포트에서 다시 측정해 수치로 증명**하는 런타임 특화 자가 치유(Self-Healing) 개발 도구입니다.

```
375px 뷰포트 · src/components/ProductCard.vue:4
부모 콘텐츠 311px, 요소 박스 473px → 230px 가로 오버플로우
패치 적용 후 재측정: 230px → 0px, 새 결함 없음 ✓
```

---

## 1. 왜 만들었나

Claude Code 같은 AI 코딩 어시스턴트는 강력하지만 **텍스트(소스 코드)만 봅니다.** 아래 결함은 소스에 "버그"로 적혀 있지 않고, 브라우저가 렌더 트리를 계산한 뒤에야 드러납니다.

- 뷰포트를 375px로 줄였을 때 Flex 아이템이나 긴 텍스트가 부모 밖으로 밀려나는 **가로 오버플로우**
- `z-index` / stacking context 충돌로 모달·드롭다운이 가려지는 현상
- 모달 포커스 트랩 누락 같은 **접근성 위반**
- CSS 상속과 레이아웃 계산이 겹쳐서 생기는 런타임 렌더링 결함

### "브라우저 MCP를 붙이면 되지 않나?"

Chrome DevTools MCP나 Playwright MCP를 붙이면 에이전트도 DOM과 스크린샷을 볼 수 있습니다. 하지만 그것은 **눈**만 주는 것입니다. 에이전트는 여전히 다음을 스스로 추측해야 합니다.

| 질문 | 범용 브라우저 MCP | Inspector-Agent |
| --- | --- | --- |
| 어디가 깨졌나? | LLM이 스크린샷/DOM을 보고 추측 | **결정론적 규칙**이 수치로 탐지 (LLM 호출 0회) |
| 그 노드는 어느 파일 몇 번째 줄인가? | 클래스명으로 grep 추측 | **Vite 플러그인이 주입한 `파일:라인:컬럼`** + 해당 클래스를 스타일링하는 **SCSS 규칙 라인** |
| 무엇을 넘겨야 하나? | 페이지 전체 DOM/스타일 | 결함 노드와 직계 부모의 **레이아웃 스타일 차이와 수치만** |
| 고쳐졌나? | "고쳤습니다"라는 LLM의 주장 | 같은 뷰포트에서 **재측정 → 0px이 아니거나 새 결함이 생기면 자동 롤백** |

> 범용 브라우저 MCP는 눈만 줍니다. Inspector-Agent는 결함을 찾는 규칙, 소스 라인 매핑, 수치 검증까지 제공해 에이전트가 추측 없이 고치게 합니다.

---

## 2. 차별점

1. **결정론적 탐지 엔진** (`packages/core`): `getBoundingClientRect`, `scrollWidth/clientWidth`, `ComputedStyle`만으로 오버플로우를 판정합니다. 조상의 `overflow: auto/hidden`으로 의도된 스크롤은 제외하고, 같은 오버플로우가 조상으로 전파된 중복은 가장 깊은 원인 노드 하나로 줄입니다. 원인 분류(`flex-item-min-width`, `nowrap-text`, `fixed-width` 등)도 규칙으로 합니다.
2. **런타임 노드 → 소스 라인 매핑** (`packages/vite-plugin`, `packages/source-locator`): 개발 서버에서 `.vue` 템플릿의 모든 HTML 요소에 `data-ia-src="src/components/Card.vue:12:5"`를 주입합니다. 그다음 SCSS 중첩(`&__title`, 하위 선택자, `@media`)을 펼쳐 노드·부모·자식 클래스를 **실제로 스타일링하는 규칙의 라인**을 찾습니다.
3. **측정 기반 검증 루프** (`packages/verifier`): 패치 적용 → HMR 대기 → 헤드리스 Chromium으로 같은 URL·뷰포트 재스캔 → 대상 결함이 사라졌고 **새 결함(회귀)이 없을 때만 통과**합니다. 실패하면 백업으로 자동 롤백합니다.
4. **토큰 효율·성공률 벤치마크** (`benchmarks`): 정답표가 있는 데모 앱으로 탐지 정확도, 매핑 정확도, 토큰 절감률, 자가 치유 성공률을 재현 가능하게 측정합니다.

---

## 3. 아키텍처

```mermaid
flowchart LR
  subgraph Browser["관측 (브라우저)"]
    VP["Vite 플러그인<br/>data-ia-src 주입"] --> PAGE["개발 중인 Vue/Nuxt 앱"]
    EXT["Chrome 확장<br/>현재 탭 탐지"] --> PAGE
    VER["Verifier (Playwright)<br/>다중 뷰포트 스캔·재측정"] --> PAGE
  end

  subgraph Hub["허브 (Nuxt 4 대시보드)"]
    API["Nitro server/api<br/>결함·패치 저장, 적용/롤백"]
    UI["결함 목록 · 소스 매핑 · Diff 검토"]
    LOC["source-locator<br/>템플릿 라인 · SCSS 규칙 라인"]
    API --- UI
    API --- LOC
  end

  subgraph Agent["추론 (MCP)"]
    MCP["inspector-agent MCP 서버"] --> CC["Claude Code / Cursor 등"]
  end

  EXT -- "POST /api/scans" --> API
  VER -- "스캔 결과" --> API
  CC -- "get_defect_context / propose_patch" --> MCP
  MCP -- "HTTP" --> API
  UI -- "사람이 승인: 적용하고 검증" --> API
  API -- "파일 쓰기 + 재측정 요청" --> VER
```

### 4단계 파이프라인

1. **관측**: Chrome 확장(현재 탭) 또는 Verifier(헤드리스, 375/768/1280px)가 같은 탐지기 번들(`detector.global.js`)을 페이지에 주입해 결함을 찾습니다.
2. **컨텍스트 압축**: 결함 노드와 직계 부모의 레이아웃 속성 중 **기본값이 아닌 것만** 남기고, 부모와 같은 상속 속성은 자식에서 제거합니다. 여기에 템플릿 해당 라인 ±6줄과 SCSS 규칙을 한 줄 요약으로 붙입니다.
3. **패치 생성**: 에이전트가 MCP `get_defect_context`로 컨텍스트를 받고 `propose_patch`로 "정확히 한 번 등장하는 원문 → 새 내용" 편집을 제안합니다. 파일은 아직 바뀌지 않습니다.
4. **시각적 검토 및 반영**: 대시보드에서 사람이 Diff를 보고 **적용하고 검증**을 누르면 백업 → 반영 → 재측정 → 통과/자동 롤백까지 한 번에 진행됩니다. 통과한 패치도 언제든 롤백할 수 있습니다.

### 패키지 구성 (pnpm 모노레포)

| 경로 | 역할 |
| --- | --- |
| `packages/core` | 공용 타입, 결정론적 탐지기(브라우저용 IIFE 번들 포함), 원인 진단, 페이로드 압축, 검색/치환 편집 적용 |
| `packages/vite-plugin` | `.vue` 템플릿 요소에 `data-ia-src` 주입 (`enforce: 'pre'`, 개발 서버 전용, 컴포넌트 태그 제외) |
| `packages/source-locator` | 템플릿 스니펫, SCSS 중첩 해석과 규칙 라인 탐색, 규칙 기반 패치 생성 |
| `packages/verifier` | Playwright 다중 뷰포트 스캔, 패치 전후 재측정과 회귀 판정, `inspector-scan` CLI |
| `packages/mcp-server` | stdio MCP 서버: `scan_page`, `list_defects`, `get_defect_context`, `propose_patch`, `get_patch_status` (+ 자율 모드 `apply_patch`) |
| `packages/extension` | Chrome 확장 (MV3). 현재 탭의 실제 뷰포트에서 탐지해 대시보드로 전송 |
| `apps/dashboard` | Nuxt 4 대시보드. 결함 현황, 소스 매핑, 에이전트 컨텍스트, Diff 검토, 적용/롤백 |
| `apps/playground` | 결함 4건과 정상 대조군 1건을 심어 둔 Vue 3 데모 앱 (벤치마크 대상) |
| `benchmarks` | 탐지·매핑·토큰·자가 치유 벤치마크 |

---

## 4. 빠른 시작

```bash
pnpm install
pnpm build                 # packages/* 빌드 (탐지기 번들, MCP 서버, 확장 포함)

# Chromium 이 없다면 한 번 설치 (또는 INSPECTOR_CHROMIUM_PATH 로 경로 지정)
pnpm dlx playwright@1.56.1 install chromium

pnpm dev:playground        # http://localhost:5173  결함이 심어진 데모 앱
pnpm dev:dashboard         # http://localhost:3000  대시보드 (기본 패치 대상: apps/playground)
```

대시보드에서 **스캔 실행**을 누르면 375px에서 결함 4건이 나타납니다. 결함을 열어 소스 매핑을 확인하고, 규칙 기반 제안이나 에이전트 패치를 **적용하고 검증**해 보세요.

### Claude Code 연결

저장소 루트의 `.mcp.json`이 MCP 서버를 등록합니다. Claude Code를 이 저장소에서 실행하고 이렇게 요청하면 됩니다.

```
inspector-agent 로 http://localhost:5173 을 스캔하고, 미해결 결함마다 컨텍스트를 읽어 패치를 제안해줘.
```

에이전트가 제안한 패치는 대시보드에서 사람이 승인합니다. 사람 없이 에이전트가 적용·검증까지 반복하게 하려면 `INSPECTOR_ALLOW_AGENT_APPLY=1`을 설정하세요. 이때 `apply_patch` 도구가 추가됩니다.

### 내 프로젝트에 붙이기

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'

export default defineConfig({
  plugins: [inspectorAgent(), vue()] // vue 플러그인보다 앞에 둔다
})
```

```bash
INSPECTOR_PROJECT_ROOT=/path/to/my-app pnpm dev:dashboard
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `INSPECTOR_PROJECT_ROOT` | `../playground` | 패치를 반영할 프로젝트 루트. 이 밖의 경로와 `node_modules`는 수정을 거부합니다 |
| `INSPECTOR_DATA_DIR` | `.inspector-agent` | 결함/패치 저장소(`store.json`)와 백업 위치 |
| `INSPECTOR_SETTLE_MS` | `800` | 파일 반영 후 재측정 전 HMR 대기 시간 |
| `INSPECTOR_CHROMIUM_PATH` | Playwright 기본 | 헤드리스 Chromium 실행 파일 |
| `INSPECTOR_DASHBOARD_URL` | `http://localhost:3000` | MCP 서버가 호출할 대시보드 주소 |
| `INSPECTOR_ALLOW_AGENT_APPLY` | 미설정 | `1`이면 MCP에 `apply_patch` 노출 (자율 모드) |

Chrome 확장은 `packages/extension/dist`를 `chrome://extensions` → **압축해제된 확장 프로그램 로드**로 불러옵니다.

---

## 5. 벤치마크

```bash
INSPECTOR_CHROMIUM_PATH=... pnpm bench   # 결과: benchmarks/results/latest.json
```

playground를 임시 디렉터리에 복사해 실행하므로 원본 파일은 바뀌지 않습니다. 아래는 2026-10-13 실행 결과입니다.

| 항목 | 결과 |
| --- | --- |
| 탐지 재현율 / 정밀도 (375px, 정답 4건) | **100% / 100%** |
| 정상 대조군(`overflow-x: auto` 표) 오탐 | **0건** |
| 1280px 결함 | 0건 (모바일에서만 깨지는 결함임을 확인) |
| 1순위 원인 진단 일치 | **4/4** |
| 노드 → `파일:라인:컬럼` 정확 매핑 | **4/4** |
| 탐지 시간 | 노드 59개, 약 4ms |
| 토큰: DOM HTML / DOM+레이아웃 스타일 / DOM+전체 ComputedStyle | 1,475 / 8,458 / 162,159 |
| 토큰: Inspector 컨텍스트 (결함 4건 합계) | **1,267** (결함당 약 317) |
| 토큰 절감률 | 레이아웃 덤프 대비 **85.0%**, 전체 스타일 덤프 대비 **99.2%** |
| 규칙 기반 자가 치유 (LLM 없음) | **3/4 치유**, 첫 시도 성공 2건, 재측정으로 잡아낸 회귀 **2건** |

자가 치유 루프 상세는 다음과 같습니다.

```
TagList.vue      +275px  flex-shrink-disabled ✗(회귀) → flex-nowrap ✓
ShareLink.vue    +253px  unbreakable-text ✓
ProductCard.vue  +230px  flex-item-min-width ✗(회귀) → flex-nowrap ✗      ← 복합 원인
PromoBanner.vue  +109px  fixed-width ✓
```

`ProductCard`는 **flex item의 `min-width: auto`와 자식 제목의 `white-space: nowrap`이 함께 원인**입니다. `min-width: 0`만 넣으면 박스 오버플로우는 사라지지만 제목 텍스트가 박스를 넘치는 새 결함이 생깁니다. 검증 루프가 이 회귀를 잡아 자동 롤백했고, 이는 "고쳤다는 주장"과 "고쳐진 것이 측정됨"의 차이를 보여 줍니다. 같은 결함에 대해 에이전트가 자식 규칙 컨텍스트를 보고 `&__info { min-width: 0 }`과 제목 말줄임을 함께 제안한 패치는 **230px → 0px, 새 결함 없음**으로 검증을 통과했습니다 (MCP `propose_patch` → 대시보드 적용으로 확인).

> **해석 시 주의**: 정답표는 이 프로젝트가 직접 심은 작은 데모 결함 4건입니다. 범용 정확도를 주장하는 수치가 아니라 파이프라인이 끝까지 동작함을 재현 가능하게 보여 주는 회귀 테스트로 봐야 합니다. 토큰 수는 4자당 1토큰 근사치입니다. 실제 서비스 페이지와 실제 토크나이저로 확장하는 것이 다음 단계입니다.

---

## 6. 기대 효과

### 개발자에게
- **반응형 QA 시간 단축**: 뷰포트를 바꿔 가며 눈으로 찾던 오버플로우를 375/768/1280px 자동 스캔으로 몇 초 안에 목록화합니다. 데모 기준 탐지는 수 ms, 패치 1건 검증은 약 2초입니다.
- **"어디를 고쳐야 하나"의 제거**: 결함이 `ProductCard.vue:4`와 `L46 .product-card__title { white-space: nowrap; }`처럼 파일·라인·규칙 단위로 바로 연결됩니다. DevTools에서 요소를 찾아 소스로 거슬러 올라가는 과정이 사라집니다.
- **안전한 적용**: 모든 반영은 백업되고, 검증에 실패하면 자동으로 원복되며, 통과한 패치도 한 번에 롤백할 수 있습니다. 제안 이후 파일이 바뀌었으면 적용을 거부해 덮어쓰기 사고를 막습니다.

### AI 에이전트 활용 측면에서
- **토큰 비용 절감**: 페이지 전체를 넘기는 대신 결함당 수백 토큰의 압축 컨텍스트만 사용합니다. 데모 기준 전체 스타일 덤프 대비 99% 이상 줄었습니다.
- **추측 대신 근거**: 에이전트는 탐지·매핑·원인 후보가 이미 정리된 상태에서 시작하므로 탐색에 쓰는 턴이 줄고, 패치가 최소 변경(기존 SCSS 규칙에 선언 추가)으로 수렴합니다.
- **신뢰할 수 있는 성공률**: 성공 여부를 재측정 수치로 기록하므로 "LLM 패치가 실제로 몇 % 고쳤는가"를 대시보드 통계로 추적할 수 있습니다. 규칙 기반 기준선과 에이전트 패치를 같은 기준으로 비교할 수 있습니다.
- **에이전트 중립성**: MCP로 노출되므로 Claude Code, Cursor 등 MCP를 지원하는 어떤 에이전트에도 붙습니다.

### 팀과 제품 품질 측면에서
- **회귀 방지**: 패치가 다른 곳을 깨뜨리면(같은 뷰포트의 새 결함) 바로 실패로 판정됩니다. 향후 CI에 스캔을 넣으면 PR 단위로 레이아웃 회귀를 막을 수 있습니다.
- **사람 중심 통제(Human-in-the-loop)**: 기본값은 사람이 Diff를 승인해야 파일이 바뀌는 구조입니다. 자율 모드는 명시적으로 켜야만 동작합니다.
- **지식의 축적**: 원인 분류 규칙(`flex-item-min-width` 등)이 코드로 남아 팀의 CSS 디버깅 노하우가 재사용 가능한 자산이 됩니다.

---

## 7. 한계와 로드맵

현재 범위는 **Vue/Nuxt의 가로 레이아웃 오버플로우** 하나로 의도적으로 좁혔습니다.

- [ ] z-index / stacking context 충돌 탐지 (요소 중심점 `elementFromPoint` 가림 검사)
- [ ] 접근성: 모달 포커스 트랩, 대비, 라벨 누락 규칙
- [ ] React(`__source`/소스맵) 매핑, CSS Modules·Tailwind 클래스 → 소스 매핑
- [ ] 실제 서비스 페이지 벤치마크와 실제 토크나이저 기반 토큰 측정, LLM 패치 성공률 리포트
- [ ] CI용 `inspector-scan --fail-on high` 와 PR 코멘트
- [ ] 확장에서 뷰포트 에뮬레이션(chrome.debugger) 지원. 현재 확장은 탭의 실제 너비로만 검사합니다.
- 컴포넌트 태그(`<ItemCard>`)에는 속성을 주입하지 않습니다. fallthrough 속성이 자식 컴포넌트 루트의 위치를 덮어쓰기 때문입니다. 따라서 매핑은 각 컴포넌트 안의 일반 요소 기준입니다.

---

## 8. 개발 규칙

- 기술 스택: Nuxt 4 (Vue 3 Composition API), pnpm, SCSS(scoped), TypeScript
- SFC 블록 순서: `<template>` → `<script setup lang="ts">` → `<style lang="scss" scoped>`
- `<script setup>` 선언 순서: import → define → composable → interface/type → 변수 → lifecycle → computed → method → useHead → watch
- 모든 함수는 반환 타입을 명시한 화살표 함수로 작성하고, `null` 대신 `undefined`나 타입별 기본값을 씁니다.
- 시맨틱 마크업(`section`/`article`/`header`/`main`/`aside`), `<form @submit.prevent>`, `label[for]`과 `input[id]`의 1:1 매핑, 표에는 `caption`/`thead`/`tbody`/`th[scope]`를 씁니다.
- 주석, 문서, 커밋 메시지는 한국어로 작성합니다.

```bash
pnpm test        # core / source-locator / vite-plugin 단위 테스트
pnpm typecheck   # 전 패키지 타입 검사 (대시보드는 nuxt typecheck)
pnpm bench       # 엔드 투 엔드 벤치마크 (Chromium 필요)
```
