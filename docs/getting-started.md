# 처음 써 보는 사람을 위한 시작 가이드

Inspector-Agent 를 한 번도 써 보지 않은 상태에서, **테스트용 새 Vue 프로젝트를 만들어 결함을 하나 심고 → 찾고 → Claude Code 로 고치고 → 되돌리기**까지 따라 하는 문서입니다. 아래 순서는 빈 폴더에서 그대로 실행해 확인했습니다(2026-10-13, npm 배포 버전 `0.2.0`, Vite 8, Vue 3.5).

## 0. 등장하는 프로젝트는 딱 두 개입니다

이 문서는 아래 두 이름만 씁니다. 각 단계 제목에 **작업 위치**를 적어 두었으니, 그 폴더에서 명령을 실행하세요.

| 이름 | 폴더 (예시) | 무엇인가 |
| --- | --- | --- |
| **Inspector-Agent 프로젝트** | `~/work/Inspector-Agent` | 이 저장소. GitHub 에서 clone 합니다. 여기서 **대시보드**를 띄웁니다 |
| **테스트 프로젝트 (my-app)** | `~/work/my-app` | 결함을 찾고 고쳐 볼 **새 Vue 프로젝트**. 이 문서에서 직접 만듭니다. 나중에는 이 자리에 실제 서비스 프로젝트가 들어갑니다 |

두 폴더는 서로 독립된 형제 폴더입니다. 하나를 다른 하나 안에 넣지 마세요.

```
~/work/
├── Inspector-Agent/   ← Inspector-Agent 프로젝트 (대시보드를 띄우는 곳)
└── my-app/            ← 테스트 프로젝트 (플러그인 설치, .mcp.json, Claude Code 실행)
```

### 무엇을 어디에 설치하나

| 구성 요소 | 설치 위치 | 방법 | 하는 일 |
| --- | --- | --- | --- |
| Vite 플러그인 `@inspector-agent/vite-plugin` | **테스트 프로젝트 (my-app)** | `npm install -D` | my-app 의 개발 서버에서 HTML 요소마다 `data-ia-src="파일:라인:컬럼"` 을 붙여, 화면의 결함을 소스 줄로 찾아가게 합니다 |
| 스캔 CLI `@inspector-agent/verifier` | **테스트 프로젝트 (my-app)** (선택) | `npm install -D` | `npx inspector-scan <URL>` 로 스캔만 하고 끝냅니다. CI 용 |
| MCP 서버 `@inspector-agent/mcp-server` | 설치하지 않음 | **테스트 프로젝트 (my-app)** 에 `.mcp.json` 만 만들면 Claude Code 가 `npx` 로 자동 실행 | Claude Code 가 대시보드를 부르는 통로입니다 |
| 대시보드 | **Inspector-Agent 프로젝트** | `git clone` 후 `pnpm dev:dashboard` | 결함·패치 저장, 헤드리스 스캔, **테스트 프로젝트(my-app)의 파일을 실제로 고치고 재측정·롤백**하는 서버입니다. npm 패키지가 아닙니다 |

### 실행 중에 떠 있는 터미널 3개

| 터미널 | 작업 위치 | 실행하는 것 | 주소 |
| --- | --- | --- | --- |
| A | 테스트 프로젝트 `~/work/my-app` | my-app 개발 서버 `npm run dev` | http://localhost:5173 |
| B | Inspector-Agent 프로젝트 `~/work/Inspector-Agent` | 대시보드 `pnpm dev:dashboard` | http://localhost:3000 |
| C | 테스트 프로젝트 `~/work/my-app` | Claude Code `claude` (MCP 서버는 자동 실행) | |

흐름: 터미널 C 의 Claude Code → MCP 서버 → 터미널 B 의 대시보드 → 터미널 A 의 my-app 화면을 스캔하고, `~/work/my-app` 의 파일을 고칩니다.

## 1. 준비물 (작업 위치: 아무 곳)

- Node.js 22 이상 (`node -v`)
- pnpm 10 (`npm i -g pnpm@10`, Inspector-Agent 프로젝트의 대시보드 실행용)
- Claude Code CLI
- 헤드리스 Chromium. 컴퓨터에 한 번만 설치합니다.

```bash
npx playwright@1.56.1 install chromium
```

이미 Chrome/Chromium 이 있으면 설치 대신 경로를 지정해도 됩니다: `export INSPECTOR_CHROMIUM_PATH=/경로/chrome`

## 2. Inspector-Agent 프로젝트 받기 (작업 위치: `~/work`)

```bash
mkdir -p ~/work && cd ~/work
git clone https://github.com/HamHyunJun/Inspector-Agent.git
cd Inspector-Agent            # 이제 ~/work/Inspector-Agent = Inspector-Agent 프로젝트
pnpm install                  # 설치하면서 packages/* 가 자동 빌드됩니다
```

대시보드는 아직 띄우지 않습니다. 5단계에서 테스트 프로젝트 경로를 알려 주며 띄웁니다.

## 3. 테스트 프로젝트(my-app) 만들기 (작업 위치: `~/work` → `~/work/my-app`, 터미널 A)

### 3-1. 새 Vue 프로젝트 생성과 설치

```bash
cd ~/work                     # Inspector-Agent 폴더 밖으로 나옵니다
npm create vite@latest my-app -- --template vue-ts
cd my-app                     # 이제 ~/work/my-app = 테스트 프로젝트
npm install
npm install -D @inspector-agent/vite-plugin @inspector-agent/verifier sass
```

`sass` 는 예제 컴포넌트가 `<style lang="scss">` 를 쓰기 때문에 넣었습니다. 일반 CSS 프로젝트라면 필요 없습니다.

### 3-2. 플러그인 등록 (파일: `~/work/my-app/vite.config.ts`)

테스트 프로젝트의 `vite.config.ts` 를 이렇게 바꿉니다. **`inspectorAgent()` 를 `vue()` 보다 앞에** 둬야 합니다.

```ts
import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inspectorAgent(), vue()],
})
```

개발 서버(`vite`)에서만 동작하고 `vite build` 결과에는 속성이 들어가지 않습니다.

### 3-3. 일부러 결함 하나 심기 (파일: `~/work/my-app/src/...`)

모바일(375px)에서 가로로 넘치는 가격 카드입니다. 테스트 프로젝트에 `src/components/PriceCard.vue` 를 만듭니다.

```vue
<template>
  <article class="price-card">
    <h2 class="price-card__title">프리미엄 연간 구독 요금제 (자동 갱신, 언제든 해지 가능)</h2>
    <strong class="price-card__price">₩129,000</strong>
  </article>
</template>

<script setup lang="ts">
</script>

<style lang="scss" scoped>
.price-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ddd;

  &__title {
    margin: 0;
    font-size: 18px;
    white-space: nowrap;
  }
}
</style>
```

테스트 프로젝트의 `src/App.vue` 는 이 카드만 보여 주게 바꿉니다.

```vue
<template>
  <main class="app">
    <PriceCard />
  </main>
</template>

<script setup lang="ts">
import PriceCard from './components/PriceCard.vue'
</script>
```

테스트 프로젝트의 `src/style.css` 도 기본 스타일이 결과를 흐리지 않게 비웁니다.

```css
body { margin: 0; font-family: sans-serif; }
.app { padding: 16px; }
```

### 3-4. my-app 개발 서버 실행 (터미널 A, 작업 위치: `~/work/my-app`)

```bash
cd ~/work/my-app
npm run dev                   # http://localhost:5173  ← 이 터미널은 켜 둡니다
```

브라우저 개발자 도구에서 `<article>` 을 보면 `data-ia-src="src/components/PriceCard.vue:2:3"` 이 붙어 있어야 합니다. 이게 보이면 플러그인이 동작하는 것입니다.

## 4. 첫 스캔: CLI 로 결함 찾기 (작업 위치: `~/work/my-app`, 새 터미널)

```bash
cd ~/work/my-app
npx inspector-scan http://localhost:5173 --fail-on high
```

이렇게 나오면 성공입니다.

```
[375px] 결함 1건, 문서 가로 스크롤 196px
  - [high] src/components/PriceCard.vue:3 box +144px · 연쇄 1건 (flex-item-min-width, flex-nowrap, nowrap-text)

[768px] 결함 0건, 문서 가로 스크롤 0px
[1280px] 결함 0건, 문서 가로 스크롤 0px

실패: --fail-on high 기준 1건
```

- `PriceCard.vue:3` 은 결함 노드인 `<h2>` 가 있는 테스트 프로젝트의 소스 줄입니다.
- `연쇄 1건` 은 제목에 밀려 같이 넘친 가격(`<strong>`)입니다. 원인만 고치면 같이 사라집니다.
- 괄호 안은 결정론적 진단 결과(원인 후보)입니다.
- `--fail-on high` 때문에 종료 코드가 1입니다. CI 에서는 이 값으로 PR 을 막습니다.

여기까지가 **찾기**입니다. 고치기는 대시보드(Inspector-Agent 프로젝트)와 Claude Code(테스트 프로젝트)가 합니다.

## 5. 대시보드 띄우기 (터미널 B, 작업 위치: `~/work/Inspector-Agent`)

Inspector-Agent 프로젝트 폴더에서, **고칠 대상이 테스트 프로젝트(my-app)라고 알려 주며** 대시보드를 띄웁니다.

```bash
cd ~/work/Inspector-Agent
INSPECTOR_PROJECT_ROOT=$HOME/work/my-app \
INSPECTOR_DATA_DIR=$HOME/work/Inspector-Agent/.data/my-app \
pnpm dev:dashboard            # http://localhost:3000  ← 이 터미널도 켜 둡니다
```

- `INSPECTOR_PROJECT_ROOT` 는 **테스트 프로젝트(my-app)의 절대 경로**입니다. `data-ia-src` 경로가 이 폴더 기준이라서, 다르면 결함 상세에 소스가 비어 나옵니다.
- 대시보드는 이 폴더 밖의 파일과 `node_modules` 는 고치지 않습니다. 그래서 Inspector-Agent 프로젝트 자체는 바뀌지 않습니다.
- `INSPECTOR_DATA_DIR` 은 결함·패치 기록과 백업 위치입니다. Inspector-Agent 프로젝트 안의 `.data/` 는 git 에서 제외돼 있습니다.
- `localhost:3000` 을 브라우저로 열 필요는 없지만, 열면 결함 목록과 Diff 를 눈으로 볼 수 있습니다.

## 6. Claude Code 에 MCP 등록 (작업 위치: `~/work/my-app`)

MCP 설정은 **테스트 프로젝트(my-app)** 에 둡니다. Claude Code 를 my-app 에서 실행할 것이기 때문입니다. `~/work/my-app/.mcp.json` 을 만듭니다.

```json
{
  "mcpServers": {
    "inspector-agent": {
      "command": "npx",
      "args": ["-y", "@inspector-agent/mcp-server"],
      "env": { "INSPECTOR_DASHBOARD_URL": "http://localhost:3000" }
    }
  }
}
```

같은 일을 명령으로 해도 됩니다.

```bash
cd ~/work/my-app
claude mcp add -s project -e INSPECTOR_DASHBOARD_URL=http://localhost:3000 inspector-agent -- npx -y @inspector-agent/mcp-server
```

참고: Inspector-Agent 프로젝트에도 `.mcp.json` 이 있지만, 그건 Inspector-Agent 자체를 개발할 때 쓰는 것입니다. 이 테스트에서는 쓰지 않습니다.

그다음 **테스트 프로젝트 폴더에서** Claude Code 를 실행합니다(터미널 C).

```bash
cd ~/work/my-app
claude
```

- 처음 실행하면 `.mcp.json` 의 서버를 쓸지 묻습니다. 허용하세요.
- `/mcp` 를 입력해 `inspector-agent` 가 **connected** 이고 도구 5개(`scan_page`, `list_defects`, `get_defect_context`, `propose_patch`, `get_patch_status`)가 보이면 준비 끝입니다.
- 선택: 테스트 프로젝트의 `CLAUDE.md`(`~/work/my-app/CLAUDE.md`)에 아래 한 줄을 넣어 두면 에이전트가 파일을 직접 고치지 않고 항상 검증 루프를 탑니다.

```markdown
- 레이아웃 결함은 inspector-agent MCP 의 get_defect_context 로 컨텍스트를 읽고 propose_patch 로만 제안한다. 파일을 직접 고치지 않는다.
```

## 7. Claude Code 로 고치기 (터미널 C, 작업 위치: `~/work/my-app`)

테스트 프로젝트에서 실행한 Claude Code 에 이렇게 요청합니다.

```
inspector-agent 로 http://localhost:5173 을 스캔하고, 미해결 결함마다 컨텍스트를 읽어 패치를 제안해줘.
```

Claude Code 가 하는 일은 이렇습니다.

1. `scan_page` 로 375/768/1280px 스캔 → `d_xxxxxxxx [high/open] src/components/PriceCard.vue:3 @375px box +144px`
2. `get_defect_context` 로 압축 컨텍스트를 읽습니다. 수치(부모 309px, 요소 453px), 템플릿 3줄 주변, 노드 규칙(`L18 .price-card__title { ... white-space: nowrap; }`), 부모 규칙(`L12 .price-card { display: flex; ... }`), 진단 후보가 들어 있습니다. 파일 전체를 읽지 않습니다.
3. `propose_patch` 로 테스트 프로젝트의 `PriceCard.vue` 에 대한 패치를 제안합니다. 예를 들어 이런 Diff 입니다.

```diff
   &__title {
     margin: 0;
+    min-width: 0;
     font-size: 18px;
     white-space: nowrap;
+    overflow: hidden;
+    text-overflow: ellipsis;
   }
```

**이 시점에는 아직 테스트 프로젝트의 파일이 바뀌지 않았습니다.** 제안만 대시보드에 쌓입니다.

## 8. 적용하고 검증하기 (브라우저: http://localhost:3000)

대시보드에서 결함을 열고 Diff 를 확인한 뒤 **적용하고 검증**을 누릅니다. 대시보드가 순서대로 합니다.

1. 테스트 프로젝트의 원본 `PriceCard.vue` 백업 (Inspector-Agent 프로젝트의 `.data/my-app` 에 저장)
2. 테스트 프로젝트의 `PriceCard.vue` 에 반영 (터미널 A 의 개발 서버가 HMR 로 다시 그림)
3. 같은 URL·375px 로 재측정
4. 결과 판정

이번 예제에서는 `오버플로우 144px → 0px, 새 결함 없음` 으로 **검증 통과**하고 결함이 `resolved` 가 됩니다. 에디터에서 `~/work/my-app/src/components/PriceCard.vue` 를 열면 실제로 바뀌어 있습니다. 만약 다른 곳이 새로 넘치거나 덜 고쳐졌다면 대시보드가 **자동으로 원본으로 되돌리고** 사유를 남깁니다. 그 문구를 Claude Code 에 그대로 주고 "이 검증 결과 보고 다시 제안해줘" 라고 하면 됩니다.

대시보드 화면을 열지 않고 Claude Code 에게 적용까지 맡기려면 테스트 프로젝트의 `.mcp.json` `env` 에 `"INSPECTOR_ALLOW_AGENT_APPLY": "1"` 을 추가하고 Claude Code 를 다시 시작합니다. `apply_patch` 도구가 생기고, 같은 백업·재측정·자동 롤백을 거칩니다. 처음에는 사람이 Diff 를 보고 누르는 방식을 권합니다.

## 9. 되돌리기와 마무리

- 통과한 패치도 대시보드 결함 상세의 **롤백** 버튼으로 백업에서 원래대로 되돌릴 수 있습니다. 이번 테스트에서도 롤백 후 테스트 프로젝트의 `PriceCard.vue` 가 원본과 같아지는 것을 확인했습니다.
- 원하지 않는 제안은 **거절**합니다.
- 테스트 프로젝트에서 다시 `npx inspector-scan http://localhost:5173 --fail-on high` 를 돌려 0건(종료 코드 0)이면 끝입니다.
- 최종 변경은 테스트 프로젝트에서 `git diff` 로 한 번 더 보고 커밋합니다.

## 10. 잘 안 될 때

| 증상 | 확인할 것 |
| --- | --- |
| 스캔은 되는데 결함에 소스 위치가 없음 (`selector` 만 나옴) | 테스트 프로젝트의 `vite.config.ts` 에서 `inspectorAgent()` 가 `vue()` 앞에 있는지, 터미널 A 에서 `npm run dev` 로 띄웠는지 |
| `Executable doesn't exist` / Chromium 실행 실패 | `npx playwright@1.56.1 install chromium`, 또는 `INSPECTOR_CHROMIUM_PATH` 지정. 터미널 B(대시보드)에도 같은 환경 변수가 필요합니다 |
| `/mcp` 에서 `inspector-agent` 가 failed | Claude Code 를 테스트 프로젝트 폴더(`~/work/my-app`)에서 실행했는지, `npx -y @inspector-agent/mcp-server` 가 터미널에서 단독으로 뜨는지(대기 상태가 정상, Ctrl+C 로 종료) |
| MCP 도구가 "대시보드(...)에 연결할 수 없습니다" | 터미널 B 의 대시보드가 떠 있는지, 주소가 `INSPECTOR_DASHBOARD_URL` 과 같은지 |
| 결함 상세에 템플릿·SCSS 규칙이 비어 있음 | 터미널 B 의 `INSPECTOR_PROJECT_ROOT` 가 테스트 프로젝트(my-app)의 절대 경로인지 |
| 적용 시 "제안 이후 파일이 바뀌었습니다" | 제안 이후 테스트 프로젝트의 그 파일을 직접 고친 경우입니다. 다시 스캔하고 새로 제안받으세요 |
| 재측정이 HMR 보다 빨라 실패 | 대시보드를 `INSPECTOR_SETTLE_MS=1500` 처럼 늘려 다시 띄우세요 |

## 다음 단계: 실제 서비스 프로젝트에 붙이기

my-app 자리에 실제 서비스 프로젝트(예: Camping-Joy)를 넣으면 됩니다. 바뀌는 것은 세 가지뿐입니다.

1. 실제 프로젝트에 3-1 의 `npm install -D ...` 와 3-2 의 플러그인 등록
2. 실제 프로젝트에 6단계의 `.mcp.json`
3. 터미널 B 에서 `INSPECTOR_PROJECT_ROOT` 를 실제 프로젝트의 절대 경로로 바꿔 대시보드 실행

Nuxt·React 설정, 시나리오 스캔(로그인·모달 상태), CI 연동은 [README 5. 운영 가이드](../README.md#5-운영-가이드)를 보세요. 로그인이 필요한 화면은 Chrome 확장으로 지금 보는 탭을 그대로 스캔할 수 있습니다([`extension-testing.md`](extension-testing.md)).
