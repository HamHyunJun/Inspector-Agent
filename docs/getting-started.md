# 처음 써 보는 사람을 위한 시작 가이드

Inspector-Agent 를 한 번도 써 보지 않은 상태에서, **새 Vue 프로젝트를 만들어 결함을 하나 심고 → 찾고 → Claude Code 로 고치고 → 되돌리기**까지 따라 하는 문서입니다. 아래 순서는 빈 폴더에서 그대로 실행해 확인했습니다(2026-10-13, npm 배포 버전 `0.2.0`, Vite 8, Vue 3.5).

## 0. 무엇을 어디에 설치하나

헷갈리기 쉬운 부분부터 정리합니다. **설치 위치가 세 군데**입니다.

| 무엇 | 어디에 | 어떻게 | 하는 일 |
| --- | --- | --- | --- |
| Vite 플러그인 `@inspector-agent/vite-plugin` | **테스트할 내 프로젝트** | `npm install -D` | 개발 서버에서 HTML 요소마다 `data-ia-src="파일:라인:컬럼"` 을 붙여, 화면의 결함을 소스 줄로 찾아갈 수 있게 합니다 |
| 스캔 CLI `@inspector-agent/verifier` | **내 프로젝트** (선택) | `npm install -D` | `npx inspector-scan <URL>` 로 스캔만 하고 끝냅니다. CI 용 |
| MCP 서버 `@inspector-agent/mcp-server` | 설치하지 않음 | 내 프로젝트의 `.mcp.json` 에 등록하면 Claude Code 가 `npx` 로 자동 실행 | Claude Code 가 대시보드를 부르는 통로입니다 |
| 대시보드 | **Inspector-Agent 저장소** (git clone) | `pnpm dev:dashboard` | 결함·패치 저장, 헤드리스 스캔, **내 프로젝트 파일을 실제로 고치고 재측정·롤백**하는 서버입니다. npm 패키지가 아닙니다 |

즉 **내 프로젝트에는 플러그인(필수)과 CLI(선택)만** 설치하고, **대시보드는 Inspector-Agent 저장소에서 따로 띄웁니다.** MCP 서버는 설정 파일 한 개로 끝납니다.

실행 중에는 터미널 3개가 떠 있게 됩니다.

```
[터미널 A] 내 프로젝트 개발 서버      http://localhost:5173
[터미널 B] Inspector-Agent 대시보드  http://localhost:3000   ← 내 프로젝트 폴더를 고치는 곳
[터미널 C] Claude Code (내 프로젝트 폴더에서 실행) → MCP 서버 자동 실행 → 대시보드 호출
```

## 1. 준비물

- Node.js 22 이상 (`node -v`)
- pnpm 10 (`npm i -g pnpm@10`, 대시보드 실행용)
- Claude Code CLI
- 헤드리스 Chromium. 한 번만 설치합니다.

```bash
npx playwright@1.56.1 install chromium
```

이미 다른 Chromium/Chrome 이 있으면 설치 대신 경로를 지정해도 됩니다: `export INSPECTOR_CHROMIUM_PATH=/경로/chrome`

## 2. 대시보드 준비 (Inspector-Agent 저장소, 한 번만)

```bash
cd ~/work                                   # 원하는 위치
git clone https://github.com/HamHyunJun/Inspector-Agent.git
cd Inspector-Agent
pnpm install                                # 설치하면서 packages/* 가 자동 빌드됩니다
```

여기서는 아직 실행하지 않습니다. 4단계에서 테스트할 프로젝트 경로를 알려 주며 띄웁니다.

## 3. 테스트할 새 프로젝트 만들기 (터미널 A)

### 3-1. Vue 프로젝트 생성과 설치

```bash
cd ~/work
npm create vite@latest my-app -- --template vue-ts
cd my-app
npm install
npm install -D @inspector-agent/vite-plugin @inspector-agent/verifier sass
```

`sass` 는 예제 컴포넌트가 `<style lang="scss">` 를 쓰기 때문에 넣었습니다. 일반 CSS 프로젝트라면 필요 없습니다.

### 3-2. 플러그인 등록

`vite.config.ts` 를 이렇게 바꿉니다. **`inspectorAgent()` 를 `vue()` 보다 앞에** 둬야 합니다.

```ts
import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inspectorAgent(), vue()],
})
```

개발 서버(`vite`)에서만 동작하고 `vite build` 결과에는 속성이 들어가지 않습니다.

### 3-3. 일부러 결함 하나 심기

모바일(375px)에서 가로로 넘치는 가격 카드입니다. `src/components/PriceCard.vue` 를 만듭니다.

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

`src/App.vue` 는 이 카드만 보여 주게 바꿉니다.

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

`src/style.css` 도 기본 스타일이 결과를 흐리지 않게 비웁니다.

```css
body { margin: 0; font-family: sans-serif; }
.app { padding: 16px; }
```

### 3-4. 개발 서버 실행과 확인

```bash
npm run dev            # http://localhost:5173
```

브라우저 개발자 도구에서 `<article>` 을 보면 `data-ia-src="src/components/PriceCard.vue:2:3"` 이 붙어 있어야 합니다. 이게 보이면 플러그인이 동작하는 것입니다.

## 4. 첫 스캔: CLI 로 결함 찾기 (터미널 C, 아무 터미널이나)

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

- `PriceCard.vue:3` 은 결함 노드인 `<h2>` 의 소스 줄입니다.
- `연쇄 1건` 은 제목에 밀려 같이 넘친 가격(`<strong>`)입니다. 원인만 고치면 같이 사라집니다.
- 괄호 안은 결정론적 진단 결과(원인 후보)입니다.
- `--fail-on high` 때문에 종료 코드가 1입니다. CI 에서는 이 값으로 PR 을 막습니다.

여기까지가 **찾기**입니다. 고치기는 대시보드와 Claude Code 가 합니다.

## 5. 대시보드 띄우기 (터미널 B)

대시보드에게 **어느 프로젝트 파일을 고칠지** 알려 주며 띄웁니다.

```bash
cd ~/work/Inspector-Agent
INSPECTOR_PROJECT_ROOT=$HOME/work/my-app \
INSPECTOR_DATA_DIR=$HOME/work/Inspector-Agent/.data/my-app \
pnpm dev:dashboard       # http://localhost:3000
```

- `INSPECTOR_PROJECT_ROOT` 는 **절대 경로**로, `package.json` 이 있는 내 프로젝트 루트를 가리켜야 합니다. `data-ia-src` 경로가 이 폴더 기준이라서, 다르면 결함 상세에 소스가 비어 나옵니다.
- 대시보드는 이 폴더 밖의 파일과 `node_modules` 는 고치지 않습니다.
- `INSPECTOR_DATA_DIR` 은 결함·패치 기록과 백업 위치입니다. 저장소의 `.data/` 는 git 에서 제외돼 있습니다.
- `localhost:3000` 을 브라우저로 열 필요는 없지만, 열면 결함 목록과 Diff 를 눈으로 볼 수 있습니다.

## 6. Claude Code 에 MCP 등록 (내 프로젝트)

`~/work/my-app/.mcp.json` 을 만듭니다.

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

그다음 **내 프로젝트 폴더에서** Claude Code 를 실행합니다.

```bash
cd ~/work/my-app
claude
```

- 처음 실행하면 `.mcp.json` 의 서버를 쓸지 묻습니다. 허용하세요.
- `/mcp` 를 입력해 `inspector-agent` 가 **connected** 이고 도구 5개(`scan_page`, `list_defects`, `get_defect_context`, `propose_patch`, `get_patch_status`)가 보이면 준비 끝입니다.
- 선택: 내 프로젝트 `CLAUDE.md` 에 아래 한 줄을 넣어 두면 에이전트가 파일을 직접 고치지 않고 항상 검증 루프를 탑니다.

```markdown
- 레이아웃 결함은 inspector-agent MCP 의 get_defect_context 로 컨텍스트를 읽고 propose_patch 로만 제안한다. 파일을 직접 고치지 않는다.
```

## 7. Claude Code 로 고치기

Claude Code 에 이렇게 요청합니다.

```
inspector-agent 로 http://localhost:5173 을 스캔하고, 미해결 결함마다 컨텍스트를 읽어 패치를 제안해줘.
```

Claude Code 가 하는 일은 이렇습니다.

1. `scan_page` 로 375/768/1280px 스캔 → `d_xxxxxxxx [high/open] src/components/PriceCard.vue:3 @375px box +144px`
2. `get_defect_context` 로 압축 컨텍스트를 읽습니다. 수치(부모 309px, 요소 453px), 템플릿 3줄 주변, 노드 규칙(`L18 .price-card__title { ... white-space: nowrap; }`), 부모 규칙(`L12 .price-card { display: flex; ... }`), 진단 후보가 들어 있습니다. 파일 전체를 읽지 않습니다.
3. `propose_patch` 로 제안합니다. 예를 들어 이런 Diff 입니다.

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

**이 시점에는 아직 파일이 바뀌지 않았습니다.** 제안만 대시보드에 쌓입니다.

## 8. 적용하고 검증하기

http://localhost:3000 에서 결함을 열고 Diff 를 확인한 뒤 **적용하고 검증**을 누릅니다. 대시보드가 순서대로 합니다.

1. 원본 백업
2. `PriceCard.vue` 에 반영 (개발 서버가 HMR 로 다시 그림)
3. 같은 URL·375px 로 재측정
4. 결과 판정

이번 예제에서는 `오버플로우 144px → 0px, 새 결함 없음` 으로 **검증 통과**하고 결함이 `resolved` 가 됩니다. 에디터에서 `PriceCard.vue` 를 열면 실제로 바뀌어 있습니다. 만약 다른 곳이 새로 넘치거나 덜 고쳐졌다면 대시보드가 **자동으로 원본으로 되돌리고** 사유를 남깁니다. 그 문구를 Claude Code 에 그대로 주고 "이 검증 결과 보고 다시 제안해줘" 라고 하면 됩니다.

대시보드 화면을 열지 않고 Claude Code 에게 적용까지 맡기려면 `.mcp.json` 의 `env` 에 `"INSPECTOR_ALLOW_AGENT_APPLY": "1"` 을 추가하고 Claude Code 를 다시 시작합니다. `apply_patch` 도구가 생기고, 같은 백업·재측정·자동 롤백을 거칩니다. 처음에는 사람이 Diff 를 보고 누르는 방식을 권합니다.

## 9. 되돌리기와 마무리

- 통과한 패치도 대시보드 결함 상세의 **롤백** 버튼으로 백업에서 원래대로 되돌릴 수 있습니다. 이번 테스트에서도 롤백 후 `PriceCard.vue` 가 원본과 같아지는 것을 확인했습니다.
- 원하지 않는 제안은 **거절**합니다.
- 다시 `npx inspector-scan http://localhost:5173 --fail-on high` 를 돌려 0건(종료 코드 0)이면 끝입니다.
- 최종 변경은 `git diff` 로 한 번 더 보고 커밋합니다.

## 10. 잘 안 될 때

| 증상 | 확인할 것 |
| --- | --- |
| 스캔은 되는데 결함에 소스 위치가 없음 (`selector` 만 나옴) | `vite.config.ts` 에서 `inspectorAgent()` 가 `vue()` 앞에 있는지, 개발 서버(`npm run dev`)로 띄웠는지 |
| `Executable doesn't exist` / Chromium 실행 실패 | `npx playwright@1.56.1 install chromium`, 또는 `INSPECTOR_CHROMIUM_PATH` 지정. 대시보드 터미널에도 같은 환경 변수가 필요합니다 |
| `/mcp` 에서 `inspector-agent` 가 failed | 내 프로젝트 폴더에서 `claude` 를 실행했는지, `npx -y @inspector-agent/mcp-server` 가 터미널에서 단독으로 뜨는지(대기 상태가 정상, Ctrl+C 로 종료) |
| MCP 도구가 "대시보드(...)에 연결할 수 없습니다" | 터미널 B 의 대시보드가 떠 있는지, 주소가 `INSPECTOR_DASHBOARD_URL` 과 같은지 |
| 결함 상세에 템플릿·SCSS 규칙이 비어 있음 | `INSPECTOR_PROJECT_ROOT` 가 내 프로젝트 루트의 절대 경로인지 |
| 적용 시 "제안 이후 파일이 바뀌었습니다" | 제안 이후 그 파일을 직접 고친 경우입니다. 다시 스캔하고 새로 제안받으세요 |
| 재측정이 HMR 보다 빨라 실패 | 대시보드를 `INSPECTOR_SETTLE_MS=1500` 처럼 늘려 다시 띄우세요 |

## 다음 단계

- 실제 프로젝트에 붙이기, Nuxt·React 설정, 시나리오 스캔(로그인·모달 상태), CI 연동은 [README 5. 운영 가이드](../README.md#5-운영-가이드)를 보세요.
- 로그인이 필요한 화면은 Chrome 확장으로 지금 보는 탭을 그대로 스캔할 수 있습니다([`extension-testing.md`](extension-testing.md)).
