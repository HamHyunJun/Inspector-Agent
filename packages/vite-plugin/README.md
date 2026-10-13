# @inspector-agent/vite-plugin

개발 서버에서 `.vue` 템플릿과 `.jsx/.tsx` 의 모든 HTML 요소(소문자 태그)에 `data-ia-src="파일:라인:컬럼"` 속성을 주입하는 Vite 플러그인입니다. [Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent) 가 렌더링된 DOM 노드를 **소스의 정확한 파일과 라인**에 연결하는 데 씁니다.

## 설치

```bash
npm install -D @inspector-agent/vite-plugin
```

Vite 5 이상(peer), Node 20 이상, Vue 3 SFC 와 React(JSX/TSX) 가 대상입니다. React 는 `plugins: [inspectorAgent(), react()]` 처럼 react 플러그인보다 앞에 둡니다 (Babel/oxc 어느 쪽이든 동작).

## 사용

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [inspectorAgent(), vue()] // vue 플러그인보다 앞에 둡니다 (원본 SFC 를 먼저 변환해야 라인이 맞습니다)
})
```

Nuxt 4:

```ts
// nuxt.config.ts
import inspectorAgent from '@inspector-agent/vite-plugin'

export default defineNuxtConfig({ vite: { plugins: [inspectorAgent()] } })
```

그러면 개발 서버의 DOM 이 이렇게 바뀝니다.

```html
<section data-ia-src="src/components/Card.vue:2:3" class="card">…</section>
```

## 동작 규칙

- **개발 서버에서만** 동작합니다. 프로덕션 빌드에는 속성이 들어가지 않습니다(`includeBuild: true` 로 켤 수 있음).
- **컴포넌트 태그(`<ItemCard>`)에는 주입하지 않습니다.** 부모가 준 fallthrough 속성이 자식 컴포넌트 루트의 위치를 덮어쓰기 때문입니다. 매핑은 각 컴포넌트 안의 일반 HTML 요소 기준입니다.
- 경로는 **프로젝트 루트(`package.json` 이 있는 가장 가까운 상위 폴더) 기준**입니다. Nuxt 4 처럼 Vite root 가 `app/` 이어도 `app/pages/index.vue:12:5` 로 나옵니다.

## 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `attribute` | `data-ia-src` | 주입할 속성 이름. 탐지기 기본값과 같아야 합니다 |
| `includeBuild` | `false` | 프로덕션 빌드에도 주입할지 |
| `exclude` | 없음 | 주입 대상에서 제외할 파일 조건 `(id: string) => boolean` |

## 라이선스

MIT
