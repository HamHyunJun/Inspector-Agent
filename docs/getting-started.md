# 처음 써 보는 사람을 위한 시작 가이드

> **대시보드 모드 가이드입니다.** 이 문서는 결함을 화면(대시보드)으로 보며 고치는 방법을 따라 합니다. 대시보드 없이 터미널이나 Claude Code만 쓰려면 [README](../README.md)의 A·B 절이 더 간단합니다(대시보드가 필요 없습니다).

Inspector-Agent 를 처음 써 보는 사람이 **명령을 그대로 복사해 붙여 넣기만 해서** 결함 찾기 → Claude Code 로 고치기 → 되돌리기까지 해 보는 문서입니다.

아래 명령은 모두 실제로 실행해 확인했습니다(2026-10-13, npm 배포 버전 `0.2.0`). 확인한 조합은 두 가지입니다.

- 새 Vue + Vite 프로젝트 (npm)
- Nuxt 4 프로젝트 (pnpm)

> **명령 블록 읽는 법**: 회색 상자 안의 줄을 **한 줄씩 통째로** 복사해 터미널에 붙여 넣고 Enter 를 누르세요. `#` 뒤는 설명이라 같이 복사돼도 실행에 영향이 없습니다. 명령 중간을 바꿔 써야 하는 곳은 없습니다.

---

## 0. 등장하는 프로젝트는 두 개입니다

| 이름 | 폴더 | 무엇인가 |
| --- | --- | --- |
| **Inspector-Agent 프로젝트** | `~/work/Inspector-Agent` | 이 저장소입니다. GitHub 에서 받아서 **대시보드를 띄우는 데만** 씁니다 |
| **테스트 프로젝트** | 새로 만들면 `~/work/my-app`<br>이미 있는 Nuxt 프로젝트면 그 폴더(예: `~/TaxKit`) | 결함을 찾고 고칠 대상입니다. 플러그인 설치, 설정 파일, Claude Code 실행을 전부 여기서 합니다 |

`~` 는 내 홈 폴더(맥에서는 `/Users/내이름`)를 뜻하고, 터미널이 알아서 바꿔 줍니다.

실행 중에는 터미널 3개가 떠 있게 됩니다.

| 터미널 | 어느 폴더에서 | 무엇을 | 주소 |
| --- | --- | --- | --- |
| A | 테스트 프로젝트 | 테스트 프로젝트 개발 서버 | http://localhost:5173 |
| B | Inspector-Agent 프로젝트 | 대시보드 | http://localhost:3000 |
| C | 테스트 프로젝트 | Claude Code | |

대시보드가 3000번을 쓰기 때문에, **테스트 프로젝트는 항상 5173번으로 띄웁니다.** Nuxt 의 기본 포트도 3000이라 그대로 띄우면 둘이 충돌합니다.

---

## 1. 컴퓨터 준비 (한 번만, 아무 폴더에서)

### 1-1. Node.js 와 pnpm 확인

```bash
node -v
```

`v22.` 이상이 나오면 됩니다. 아니면 https://nodejs.org 에서 LTS 를 설치하세요.

```bash
npm install -g pnpm@10
```

```bash
pnpm -v
```

`10.` 으로 시작하면 됩니다.

### 1-2. 스캔용 헤드리스 Chromium 설치

```bash
npx playwright@1.56.1 install chromium
```

`Downloading Chromium ...` 이 끝나면 됩니다. 이미 설치돼 있으면 바로 끝납니다.

### 1-3. Claude Code 확인

```bash
claude --version
```

버전이 나오면 됩니다.

---

## 2. Inspector-Agent 프로젝트 받기 (한 번만)

```bash
mkdir -p ~/work
```

```bash
cd ~/work
```

```bash
git clone https://github.com/HamHyunJun/Inspector-Agent.git
```

```bash
cd ~/work/Inspector-Agent
```

```bash
pnpm install
```

마지막 줄에 오류 없이 `Done` 이 나오면 됩니다. 이 과정에서 대시보드와 MCP 서버가 함께 빌드됩니다. 대시보드는 5단계에서 띄웁니다.

---

## 3. 테스트 프로젝트 준비

둘 중 **하나만** 따라 하세요.

- **3-A**: 연습용 새 Vue 프로젝트를 만든다 (처음이면 이쪽을 권합니다)
- **3-B**: 이미 있는 Nuxt + pnpm 프로젝트에 붙인다 (예: TaxKit)

### 3-A. 새 Vue 프로젝트 만들기 (npm)

**① 프로젝트 생성**

```bash
cd ~/work
```

```bash
npm create vite@latest my-app -- --template vue-ts --no-interactive
```

`Ok to proceed? (y)` 가 나오면 `y` 를 누르세요. 끝나면 `~/work/my-app` 폴더가 생깁니다.

```bash
cd ~/work/my-app
```

```bash
npm install
```

**② Inspector-Agent 패키지 설치**

아래 한 줄에 패키지 3개가 다 들어 있습니다. 끊지 말고 통째로 복사하세요.

```bash
npm install -D @inspector-agent/vite-plugin @inspector-agent/verifier sass
```

- `@inspector-agent/vite-plugin`: 화면의 각 요소에 "이 요소는 어느 파일 몇 번째 줄" 표시를 붙입니다(필수)
- `@inspector-agent/verifier`: 터미널에서 `inspector-scan` 명령으로 스캔하게 해 줍니다
- `sass`: 아래 예제 컴포넌트가 SCSS 를 쓰기 때문에 넣습니다
- `-D` 는 "개발할 때만 쓰는 패키지로 설치"라는 뜻이고, **반드시 뒤에 패키지 이름이 와야 합니다.** `npm install -D` 만 치면 아무것도 설치되지 않습니다.

**③ 플러그인 등록**

`~/work/my-app/vite.config.ts` 파일을 에디터로 열어 **내용 전체를** 아래로 바꿉니다.

```ts
import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inspectorAgent(), vue()],
})
```

`inspectorAgent()` 는 반드시 `vue()` 보다 **앞에** 있어야 합니다.

**④ 일부러 결함 하나 심기**

`~/work/my-app/src/components/PriceCard.vue` 파일을 새로 만들고 아래를 붙여 넣습니다. 모바일(375px)에서 제목이 줄바꿈되지 않아 화면 밖으로 넘치는 카드입니다.

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

`~/work/my-app/src/App.vue` 의 **내용 전체를** 아래로 바꿉니다.

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

`~/work/my-app/src/style.css` 의 **내용 전체를** 아래로 바꿉니다.

```css
body { margin: 0; font-family: sans-serif; }
.app { padding: 16px; }
```

**⑤ 개발 서버 실행 (터미널 A)**

```bash
cd ~/work/my-app
```

```bash
npm run dev
```

`Local: http://localhost:5173/` 이 보이면 됩니다. **이 터미널은 끄지 말고 그대로 두세요.**

이제 4단계로 가세요. 이후 단계에서 "테스트 프로젝트 폴더"는 `~/work/my-app` 입니다.

### 3-B. 이미 있는 Nuxt + pnpm 프로젝트에 붙이기 (예: TaxKit)

여기서는 프로젝트가 `~/TaxKit` 에 있다고 가정합니다. 다른 위치라면 `cd ~/TaxKit` 줄만 실제 폴더로 바꾸세요.

**① 프로젝트 폴더로 이동하고 의존성 복구**

```bash
cd ~/TaxKit
```

```bash
pnpm install
```

> `pnpm install -D` 처럼 **뒤에 패키지 이름 없이** `-D` 를 붙이면, pnpm 은 "개발용 패키지만 설치"로 이해합니다. 그러면 `nuxt` 같은 일반 의존성이 지워집니다. 이어서 `nuxt prepare` 를 실행할 때 `sh: nuxt: command not found` 가 납니다. 위의 `pnpm install`(-D 없이)을 한 번 실행하면 원래대로 돌아옵니다.

**② Inspector-Agent 패키지 설치**

아래 한 줄을 통째로 복사하세요.

```bash
pnpm add -D @inspector-agent/vite-plugin @inspector-agent/verifier
```

- pnpm 에서 패키지를 **추가**하는 명령은 `install` 이 아니라 `add` 입니다.
- 프로젝트가 SCSS(`lang="scss"`)를 쓰는데 `sass` 가 없다면 `pnpm add -D sass` 도 실행하세요. 이미 쓰고 있다면 필요 없습니다.
- `Ignored build scripts: ...` / `pnpm approve-builds` 경고는 무시해도 됩니다.

**③ 플러그인 등록**

`~/TaxKit/nuxt.config.ts` 를 열고 두 군데를 고칩니다.

맨 위에 이 줄을 추가합니다.

```ts
import inspectorAgent from '@inspector-agent/vite-plugin'
```

`defineNuxtConfig({ ... })` 안에 `vite` 항목을 추가합니다.

```ts
  vite: { plugins: [inspectorAgent()] },
```

이미 `vite: { ... }` 가 있다면 새로 만들지 말고, 그 안의 `plugins: [ ... ]` 배열에 `inspectorAgent()` 를 추가하세요(`plugins` 가 없으면 `plugins: [inspectorAgent()],` 한 줄을 넣습니다). 고친 결과는 대략 이런 모양입니다.

```ts
import inspectorAgent from '@inspector-agent/vite-plugin'

export default defineNuxtConfig({
  // ...원래 있던 설정들은 그대로...
  vite: { plugins: [inspectorAgent()] },
})
```

**④ 개발 서버를 5173번 포트로 실행 (터미널 A)**

```bash
cd ~/TaxKit
```

```bash
pnpm dev --port 5173
```

`Local: http://localhost:5173/` 이 보이면 됩니다. **이 터미널은 끄지 말고 그대로 두세요.**

- 그냥 `pnpm dev` 로 띄우면 3000번을 써서 대시보드와 부딪힙니다.
- Nuxt 프로젝트는 소스가 `app/` 아래에 있어서 결함 위치가 `app/components/...vue:3` 처럼 나옵니다. 정상입니다.

이제 4단계로 가세요. 이후 단계에서 "테스트 프로젝트 폴더"는 `~/TaxKit` 입니다. **4~9단계의 명령에 `~/work/my-app` 이 나오면 `~/TaxKit` 으로, `npx` 는 `pnpm exec` 로 바꿔서** 실행하세요. 각 단계에 두 버전을 모두 적어 두었습니다.

---

## 4. 첫 스캔: 터미널에서 결함 찾기 (새 터미널)

**3-A(my-app)를 따라 했다면:**

```bash
cd ~/work/my-app
```

```bash
npx inspector-scan http://localhost:5173 --fail-on high
```

**3-B(TaxKit)를 따라 했다면:**

```bash
cd ~/TaxKit
```

```bash
pnpm exec inspector-scan http://localhost:5173 --fail-on high
```

3-A 예제라면 이렇게 나옵니다.

```
[375px] 결함 1건, 문서 가로 스크롤 196px
  - [high] src/components/PriceCard.vue:3 box +144px · 연쇄 1건 (flex-item-min-width, flex-nowrap, nowrap-text)

[768px] 결함 0건, 문서 가로 스크롤 0px
[1280px] 결함 0건, 문서 가로 스크롤 0px

실패: --fail-on high 기준 1건
```

- 375px(모바일), 768px(태블릿), 1280px(데스크톱) 세 화면 크기로 검사합니다.
- `src/components/PriceCard.vue:3` 은 넘친 요소가 있는 파일과 줄 번호입니다.
- `연쇄 1건` 은 제목에 밀려 같이 넘친 가격입니다. 원인만 고치면 같이 사라집니다.
- 괄호 안은 원인 후보입니다.
- 마지막 `실패:` 줄은 `--fail-on high` 기준에 걸렸다는 뜻이고, 결함이 있으니 정상입니다.

TaxKit 은 실제 프로젝트라 결과가 다릅니다. `결함 0건` 이면 그 화면에는 가로 넘침이 없는 것입니다.

여기까지가 **찾기**입니다. 이 스캔은 이 터미널에서만 보고 끝납니다. 다음 단계부터가 **고치기**입니다.

---

## 5. 대시보드 띄우기 (터미널 B)

대시보드는 Inspector-Agent 프로젝트 폴더에서 띄우되, **어느 테스트 프로젝트의 파일을 고칠지** 알려 줘야 합니다.

```bash
cd ~/work/Inspector-Agent
```

**3-A(my-app)를 따라 했다면** 아래 한 줄을 통째로 복사하세요.

```bash
INSPECTOR_PROJECT_ROOT=$HOME/work/my-app INSPECTOR_DATA_DIR=$HOME/work/Inspector-Agent/.data/my-app pnpm dev:dashboard
```

**3-B(TaxKit)를 따라 했다면** 아래 한 줄을 통째로 복사하세요.

```bash
INSPECTOR_PROJECT_ROOT=$HOME/TaxKit INSPECTOR_DATA_DIR=$HOME/work/Inspector-Agent/.data/taxkit pnpm dev:dashboard
```

`Local: http://localhost:3000/` 이 보이면 됩니다. **이 터미널도 끄지 말고 그대로 두세요.**

- `INSPECTOR_PROJECT_ROOT`: 대시보드가 고칠 테스트 프로젝트 폴더입니다. 대시보드는 이 폴더 밖의 파일과 `node_modules` 는 절대 고치지 않습니다.
- `INSPECTOR_DATA_DIR`: 결함·패치 기록과 원본 백업을 저장할 곳입니다. Inspector-Agent 프로젝트 안의 `.data/` 에 두므로 테스트 프로젝트에는 아무 파일도 생기지 않습니다.
- 브라우저로 http://localhost:3000 을 열면 결함 목록과 변경 내용(Diff)을 눈으로 볼 수 있습니다. 8단계에서 씁니다.

---

## 6. Claude Code 에 Inspector-Agent 연결하기 (MCP 등록)

MCP 는 따로 설치하지 않습니다. 테스트 프로젝트 폴더에서 아래 명령 한 줄로 등록하면, Claude Code 가 필요할 때 자동으로 내려받아 실행합니다.

**3-A(my-app)를 따라 했다면:**

```bash
cd ~/work/my-app
```

**3-B(TaxKit)를 따라 했다면:**

```bash
cd ~/TaxKit
```

그다음 공통으로, 아래 한 줄을 통째로 복사하세요.

```bash
claude mcp add inspector-agent -s project -e INSPECTOR_DASHBOARD_URL=http://localhost:3000 -- npx -y @inspector-agent/mcp-server
```

테스트 프로젝트 폴더에 `.mcp.json` 파일이 생기면 성공입니다. 아래 명령으로 확인할 수 있습니다.

```bash
cat .mcp.json
```

`"inspector-agent"` 와 `"@inspector-agent/mcp-server"` 가 보이면 됩니다.

---

## 7. Claude Code 로 고치기 (터미널 C)

**3-A(my-app)를 따라 했다면:**

```bash
cd ~/work/my-app
```

**3-B(TaxKit)를 따라 했다면:**

```bash
cd ~/TaxKit
```

그다음 공통으로:

```bash
claude
```

1. 처음 실행하면 이 프로젝트의 `.mcp.json` 서버(inspector-agent)를 쓸지 묻습니다. **허용**을 고르세요.
2. Claude Code 입력창에 `/mcp` 를 입력하고 Enter 를 누릅니다. `inspector-agent` 옆에 **connected** 가 보이면 연결된 것입니다. Esc 로 닫습니다.
3. Claude Code 입력창에 아래 문장을 그대로 붙여 넣습니다.

```
inspector-agent 로 http://localhost:5173 을 스캔하고, 미해결 결함마다 컨텍스트를 읽어 패치를 제안해줘. 파일은 직접 고치지 말고 propose_patch 로만 제안해줘.
```

Claude Code 는 이 순서로 움직입니다.

1. `scan_page`: 세 화면 크기로 스캔합니다.
2. `get_defect_context`: 결함 줄 주변의 템플릿과 관련 CSS 규칙만 압축해서 읽습니다. 파일 전체는 읽지 않습니다.
3. `propose_patch`: 고칠 내용을 대시보드에 **제안만** 합니다.

**이 시점에는 아직 테스트 프로젝트의 파일이 바뀌지 않았습니다.** 3-A 예제라면 제안은 대략 이런 모양입니다(`+` 가 추가되는 줄).

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

---

## 8. 적용하고 검증하기 (브라우저)

1. 브라우저에서 http://localhost:3000 을 엽니다.
2. 결함 목록에서 결함을 클릭합니다.
3. 아래쪽 패치 카드에서 Diff 를 읽어 봅니다.
4. **적용하고 검증** 버튼을 누릅니다.

대시보드가 다음을 순서대로 자동으로 합니다.

1. 원본 파일 백업
2. 테스트 프로젝트 파일에 변경 반영 (터미널 A 의 개발 서버가 화면을 다시 그림)
3. 같은 화면 크기로 다시 측정
4. 판정

3-A 예제에서는 `오버플로우 144px → 0px, 새 결함 없음` 으로 **검증 통과**가 나옵니다. 에디터에서 `PriceCard.vue` 를 열면 실제로 바뀌어 있습니다.

검증에 실패하면(덜 고쳐졌거나 다른 곳이 새로 넘치면) 대시보드가 **자동으로 원본으로 되돌리고** 실패 이유를 한 줄로 남깁니다. 그 문장을 복사해 Claude Code 에 이렇게 보내면 됩니다.

```
대시보드 검증이 실패했어. 실패 이유를 get_patch_status 로 확인하고 다시 제안해줘.
```

---

## 9. 되돌리기와 마무리

- **롤백**: 통과한 패치도 결함 상세의 **롤백** 버튼을 누르면 백업에서 원래대로 돌아갑니다.
- **거절**: 마음에 들지 않는 제안은 **거절** 버튼으로 버립니다.
- **다시 확인**: 4단계의 스캔 명령을 다시 실행해 `결함 0건` 이 나오면 끝입니다.
- **커밋 전 확인**: 테스트 프로젝트 폴더에서 아래 명령으로 실제로 바뀐 내용을 확인한 뒤 커밋하세요.

```bash
git diff
```

**끝내기**: 터미널 A, B 에서 `Ctrl + C`, 터미널 C 에서 `/exit` 를 입력합니다.

---

## 10. 모달·툴팁·드롭다운처럼 "열어야 보이는" 화면 검사하기

스캔은 페이지를 **처음 연 상태 그대로** 검사합니다. 버튼을 눌러야 열리는 모달, 마우스를 올려야 나타나는 툴팁, 클릭해야 펼쳐지는 드롭다운은 처음 상태에서는 화면에 없으니 **결함이 있어도 0건**으로 나옵니다.

이런 화면은 **시나리오**로 검사합니다. 시나리오는 "스캔 전에 이 버튼을 누르고, 이 요소가 보일 때까지 기다려라"를 적은 JSON 파일입니다. 열린 상태에서 찾는 결함은 세 가지입니다.

- 가로 넘침
- 가려짐: 모달·툴팁·드롭다운이 다른 요소 밑에 깔림
- 포커스 이탈: 모달이 열려 있는데 Tab 키가 모달 밖으로 나감

시나리오 단계는 네 가지입니다.

| 단계 | 하는 일 | 예 |
| --- | --- | --- |
| `click` | 클릭 | `{ "action": "click", "selector": ".open-modal" }` |
| `hover` | 마우스 올리기 (툴팁) | `{ "action": "hover", "selector": ".help__icon" }` |
| `fill` | 입력칸에 글자 넣기 | `{ "action": "fill", "selector": "input[name=q]", "value": "부가세" }` |
| `wait` | 요소가 보일 때까지, 또는 ms 만큼 기다리기 | `{ "action": "wait", "selector": "[role=dialog]" }` |

`selector` 는 CSS 선택자입니다(클래스는 `.이름`, 속성은 `[role=dialog]`).

> `hover` 단계는 이번에 추가했습니다. 대시보드와 Claude Code 로 쓰려면 Inspector-Agent 프로젝트에서 `git pull` 후 `pnpm install` 을 한 번 실행하세요. 터미널 명령 `inspector-scan` 으로 쓰려면 npm 의 다음 버전(0.2.1 이상)이 필요합니다.

### 10-1. 실제 프로젝트(예: TaxKit)에서: Claude Code 에게 시나리오를 맡기기

선택자를 직접 찾지 않아도 됩니다. 테스트 프로젝트 폴더에서 실행한 Claude Code(터미널 C)에 아래 문장을 그대로 붙여 넣으세요. Claude Code 가 코드를 읽고 모달·툴팁을 여는 버튼을 찾아 시나리오 파일을 만든 뒤, 그 상태로 스캔합니다.

```
이 프로젝트에서 버튼을 눌러야 열리는 모달, 마우스를 올려야 나오는 툴팁, 클릭해야 펼쳐지는 드롭다운을 모두 찾아줘. 각각을 연 상태로 만드는 inspector-agent 시나리오 JSON 을 scenarios/ 폴더에 하나씩 만들어줘(단계는 click, hover, fill, wait 만 쓰고, 마지막에 열린 요소가 보일 때까지 wait 를 넣어줘). 그다음 inspector-agent 의 scan_page 를 각 시나리오 파일(scenarioFile)로 http://localhost:5173 의 해당 페이지에 실행하고, 찾은 결함마다 컨텍스트를 읽어 propose_patch 로만 패치를 제안해줘.
```

시나리오로 찾은 결함은 대시보드가 시나리오를 함께 저장해 둡니다. 그래서 8단계에서 **적용하고 검증**을 누르면 같은 모달·툴팁을 다시 연 상태로 재측정합니다.

### 10-2. 연습: my-app 에 모달과 툴팁 결함 심어 보기 (3-A 를 따라 한 경우)

**① 툴팁 컴포넌트**: `~/work/my-app/src/components/HelpTooltip.vue` 를 새로 만들고 붙여 넣습니다. `?` 에 마우스를 올리면 툴팁이 나오지만, 카드가 `z-index: 1` 상자에 갇혀 있어 아래 안내 바(`z-index: 2`)에 깔립니다.

```vue
<template>
  <section class="help">
    <div class="help__card">
      <button type="button" class="help__icon" @mouseenter="isOpen = true" @mouseleave="isOpen = false">?</button>
      <p v-if="isOpen" role="tooltip" class="help__tooltip">부가세는 결제 금액의 10%이며 연말정산 시 공제됩니다.</p>
    </div>
    <div class="help__bar">하단 고정 안내</div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref(false)
</script>

<style lang="scss" scoped>
.help {
  margin-top: 16px;

  &__card {
    position: relative;
    z-index: 1;
    padding: 8px;
  }

  &__tooltip {
    position: absolute;
    top: 40px;
    left: 8px;
    z-index: 999;
    width: 220px;
    margin: 0;
    padding: 8px;
    background: #333;
    color: #fff;
  }

  &__bar {
    position: relative;
    z-index: 2;
    height: 80px;
    background: #eef;
  }
}
</style>
```

**② 모달 컴포넌트**: `~/work/my-app/src/components/ConfirmModal.vue` 를 새로 만들고 붙여 넣습니다. 버튼을 누르면 모달이 열립니다. 긴 링크가 줄바꿈되지 않아 넘치고, Tab 키를 누르면 포커스가 모달 밖으로 나갑니다.

```vue
<template>
  <section>
    <button type="button" class="open-modal" @click="isOpen = true">공유 링크 보기</button>
    <div v-if="isOpen" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__panel">
        <h2 id="modal-title" class="modal__title">공유 링크</h2>
        <p class="modal__url">https://taxkit.example.com/share/2026/receipts/a8f3c9d2e7b14f6a9c0d3e5f7a1b2c4d</p>
        <button type="button" class="modal__close" @click="isOpen = false">닫기</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref(false)
</script>

<style lang="scss" scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 40%);

  &__panel {
    width: 300px;
    padding: 16px;
    background: #fff;
  }

  &__url {
    margin: 0 0 12px;
  }
}
</style>
```

**③ 화면에 넣기**: `~/work/my-app/src/App.vue` 의 **내용 전체를** 아래로 바꿉니다.

```vue
<template>
  <main class="app">
    <PriceCard />
    <HelpTooltip />
    <ConfirmModal />
  </main>
</template>

<script setup lang="ts">
import ConfirmModal from './components/ConfirmModal.vue'
import HelpTooltip from './components/HelpTooltip.vue'
import PriceCard from './components/PriceCard.vue'
</script>
```

**④ 시나리오 파일 두 개 만들기**: 터미널에서 테스트 프로젝트로 이동합니다.

```bash
cd ~/work/my-app
```

```bash
mkdir -p scenarios
```

아래 한 줄을 통째로 복사하면 `scenarios/tooltip.json` 이 만들어집니다.

```bash
echo '{"name":"툴팁 열기","steps":[{"action":"hover","selector":".help__icon"},{"action":"wait","selector":"[role=tooltip]"}]}' > scenarios/tooltip.json
```

아래 한 줄을 통째로 복사하면 `scenarios/modal.json` 이 만들어집니다.

```bash
echo '{"name":"모달 열기","steps":[{"action":"click","selector":".open-modal"},{"action":"wait","selector":"[role=dialog]"}]}' > scenarios/modal.json
```

**⑤ Claude Code 로 열린 상태 스캔하기**: 터미널 C 의 Claude Code 에 붙여 넣습니다.

```
inspector-agent 의 scan_page 를 http://localhost:5173 에 375px 로, scenarioFile 을 scenarios/tooltip.json 으로 한 번, scenarios/modal.json 으로 한 번 실행해줘. 찾은 결함마다 컨텍스트를 읽어 propose_patch 로만 패치를 제안해줘.
```

실제로 돌려 본 결과는 이렇습니다(375px).

| 스캔 | 찾은 결함 |
| --- | --- |
| 시나리오 없이 | `PriceCard.vue:3` 가로 넘침 1건만 (툴팁·모달은 닫혀 있어 못 봄) |
| `tooltip.json` | 위 1건 + **`HelpTooltip.vue:5` 가려짐 100% (stacking-context)** |
| `modal.json` | 위 1건 + **`ConfirmModal.vue:7` 긴 링크 넘침 +303px**, **`ConfirmModal.vue:4` 포커스 이탈 (Tab 1번째, Shift+Tab)** |

가려짐(`stacking-context`)과 포커스 이탈은 CSS 한 줄로 고쳐지지 않는 경우가 많습니다. 툴팁은 부모의 `z-index` 를 없애거나 `<Teleport to="body">` 로 옮겨야 하고, 포커스 이탈은 Tab 키를 모달 안에서 순환시키는 코드가 필요합니다. Claude Code 가 이 방향으로 제안합니다.

### 10-3. 아직 못 잡는 것

- **화면 오른쪽 끝에서 잘리는 툴팁**: 툴팁처럼 `position: absolute/fixed` 인 요소가 화면 밖으로 나가는 것은 아직 검사하지 않습니다.
- **`pointer-events: none` 인 툴팁의 가려짐**: 이런 툴팁은 가려짐 검사 대상에서 빠집니다.
- **애니메이션 중인 화면**: 열리는 애니메이션이 길면 `wait` 에 `ms` 를 더 주세요. 예: `{ "action": "wait", "ms": 500 }`

---

## 11. 잘 안 될 때

| 증상 | 해결 |
| --- | --- |
| `sh: nuxt: command not found` | 패키지 이름 없이 `pnpm install -D` 를 실행해 일반 의존성이 지워진 경우입니다. 테스트 프로젝트 폴더에서 `pnpm install` 을 실행하세요 |
| `Executable doesn't exist` / Chromium 을 찾을 수 없음 | `npx playwright@1.56.1 install chromium` 을 실행하고 터미널 B(대시보드)를 껐다 다시 켜세요 |
| 대시보드가 3000번이 아닌 다른 포트로 뜨거나 포트 사용 중 오류가 남 | 테스트 프로젝트가 3000번을 쓰고 있습니다. 터미널 A 를 `Ctrl + C` 로 끄고 `pnpm dev --port 5173`(3-B) 또는 `npm run dev`(3-A)로 다시 띄우세요 |
| 결함 위치가 파일·줄이 아니라 `div.xxx > span` 같은 선택자로만 나옴 | 플러그인 등록(3-A ③ / 3-B ③)이 빠졌거나 순서가 틀렸습니다. 고친 뒤 터미널 A 를 다시 띄우세요 |
| `/mcp` 에서 `inspector-agent` 가 failed | `claude` 를 테스트 프로젝트 폴더에서 실행했는지, 그 폴더에 `.mcp.json` 이 있는지(`cat .mcp.json`) 확인하세요 |
| Claude Code 가 "대시보드(http://localhost:3000)에 연결할 수 없습니다" | 터미널 B 의 대시보드가 꺼져 있습니다. 5단계를 다시 하세요 |
| 대시보드 결함 상세에 소스 코드가 비어 있음 | 5단계의 `INSPECTOR_PROJECT_ROOT` 가 테스트 프로젝트 폴더와 다릅니다. 터미널 B 를 끄고 맞는 명령으로 다시 띄우세요 |
| 적용 시 "제안 이후 파일이 바뀌었습니다" | 제안 후에 그 파일을 직접 고친 경우입니다. Claude Code 에 다시 스캔하고 제안해 달라고 하세요 |
| 터미널 A 에 `Sourcemap ... points to missing source files` 경고 (Nuxt) | 동작에는 영향이 없습니다. 무시하세요 |
| 모달·툴팁이 있는데 결함 0건 | 처음 상태로만 스캔한 경우입니다. 10단계의 시나리오로 연 상태에서 스캔하세요 |
| `시나리오 steps[0] (click .xxx) 실패` | 그 선택자의 요소를 5초 안에 찾지 못했습니다. 선택자 오타이거나 다른 페이지 URL 입니다 |
| `steps[0].action: "click", "fill", "wait" 중 하나여야 합니다` | `hover` 를 모르는 이전 버전입니다. Inspector-Agent 프로젝트에서 `git pull` 후 `pnpm install` 을 실행하고 대시보드를 다시 띄우세요 |

## 다음에 읽을 것

- 시나리오의 시드 데이터(localStorage·쿠키)로 로그인 상태나 데이터가 있는 화면 만들기: [`scenarios/README.md`](scenarios/README.md)
- CI 연동, 에이전트에게 적용까지 맡기는 자율 모드: [운영 가이드](operations.md)
- 로그인된 화면을 지금 보는 탭 그대로 스캔하기(Chrome 확장): [`extension-testing.md`](extension-testing.md)
