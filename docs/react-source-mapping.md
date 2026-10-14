# React(Vite) 소스 매핑과 스타일 규칙 탐색

DOM 노드 → `파일:라인:컬럼` 매핑과, 그 노드를 스타일링하는 규칙의 파일·라인 탐색을 React 프로젝트에서도 쓰기 위한 설계 기록입니다.
Vue 는 SFC 한 파일에 템플릿과 `<style>` 이 같이 있었지만, React 는 JSX 와 스타일시트가 분리되어 있어 두 가지가 다 새로 필요했습니다.

## 1. 소스 위치 매핑: 어떤 방식을 골랐나

후보 두 가지를 같은 앱(Vite 7 + React 18/19)에서 직접 실험해 비교했습니다.

| | A. `@vitejs/plugin-react` 의 jsx dev source (`fiber._debugSource`) | B. 변환 시점에 `data-ia-src` 속성 주입 (Babel 파서 기반) |
| --- | --- | --- |
| 정보가 있는 곳 | 런타임 React 내부 객체(fiber) | DOM 속성 |
| React 18.3 | `_debugSource {fileName, lineNumber, columnNumber}` 있음 | 있음 |
| React 19.3 | **`_debugSource` 가 `null`** (`_debugStack` 문자열만 남음, 파싱 필요) | 있음 |
| 격리된 월드의 스크립트(브라우저 확장 등) | **fiber 를 못 읽음.** 격리된 월드라 `__reactFiber$…` 키가 0개 | 읽음 (DOM 속성이라 월드와 무관) |
| Playwright 스캔 | 페이지 컨텍스트에서 읽어야 함 | 기존 탐지기가 그대로 읽음 |
| Vue 와의 일관성 | 프레임워크별 탐지 코드가 갈라짐 | 같은 속성·같은 형식이라 탐지기 변경 없음 |
| 변환기 의존 | `@vitejs/plugin-react` 6 은 Vite 8 필요 + Babel 을 쓰지 않음(oxc), 5 는 Babel | 변환기와 무관 (원본 코드를 먼저 파싱) |

**선택: B(속성 주입).** 이유는 세 가지입니다.

1. **React 19 에서 A 는 이미 동작하지 않습니다.** 최신 React 에서 실제로 소스 위치가 사라졌으므로 의존할 수 없습니다.
2. **격리된 월드에서 실행되는 스크립트(브라우저 확장 등)는 A 를 읽을 수 없습니다.** 그런 스크립트에서는 페이지의 React 내부 객체가 보이지 않습니다. DOM 속성만 양쪽 환경에서 같습니다.
3. **탐지기·MCP 가 이미 `data-ia-src` 를 전제로 합니다.** 같은 속성을 쓰면 React 지원이 "플러그인에 변환 하나 추가"로 끝납니다.

"Babel 플러그인으로 넣는다"와의 차이: `@vitejs/plugin-react` 의 `babel.plugins` 에 넣는 방식은 plugin-react 6 이 Babel 을 쓰지 않아 깨집니다(6.x 는 oxc, SWC 변형도 있음).
그래서 Babel 의 **파서만**(`@babel/parser`) 쓰는 독립 Vite 플러그인으로 구현하고, 기존 `inspectorAgent()` 플러그인에 `.jsx/.tsx` 처리를 합쳤습니다. 변환기에 상관없이 `enforce: 'pre'` 로 원본을 먼저 파싱하므로 라인이 원본과 일치합니다.

### 구현 메모

- 소문자 JSX 태그(`<div>`, `<p>`)에만 주입합니다. 컴포넌트(`<Card>`), 멤버(`<A.B>`), Fragment 는 DOM 요소가 아니므로 건너뜁니다.
- 컬럼은 Vue 와 같게 1-based 입니다 (Babel 의 0-based `column + 1`).
- `@babel/parser` 는 7.x 로 고정했습니다. 8.x 는 Node ≥ 22.18 을 요구하는데 이 저장소는 Node 20 을 지원합니다.
- `.tsx` 에서만 `typescript` 플러그인을 켭니다 (`.jsx` 의 제네릭 문법 충돌 방지). 파싱 실패 시 변환하지 않고 원본을 그대로 둡니다.
- `?raw`, `?url`, `?worker` 등 특수 쿼리와 `node_modules` 는 건드리지 않습니다.

## 2. 스타일 규칙 탐색

`source-locator` 에 JSX 가 import 한 스타일시트를 따라가는 탐색을 추가했습니다 (`locateSourceRules`).

- `.vue`: 기존과 같이 SFC `<style>` 블록.
- `.jsx/.tsx`: 소스의 `import './X.css'`, `import styles from './X.module.scss'` 를 찾아 **상대 경로**만 읽고(패키지 CSS 는 수정 대상이 아님), postcss-scss 로 중첩을 펼쳐 대상 클래스의 규칙 라인을 찾습니다.
- 모든 규칙에 `file` 이 붙습니다. 패치는 그 파일을 대상으로 만들어지고(`rule-patch`), MCP 출력은 JSX 와 다른 파일의 규칙 앞에 파일명을 붙입니다.

### CSS Modules

DOM 의 클래스는 `_product-card__title_1dz73_18` 처럼 해시입니다. Vite 개발 서버의 기본 이름 규칙 `_로컬이름_해시5_순번` 에서 로컬 이름을 되돌려 스타일시트 규칙과 맞춥니다(`moduleLocalName`).
JSX 의 `styles.title` 사용처를 읽는 방식도 가능하지만, 노드의 클래스 이름 하나로 해결되는 쪽이 단순해서 이쪽을 골랐습니다.

한계:
- `css.modules.generateScopedName` 으로 이름 규칙을 바꾼 프로젝트는 되돌리지 못합니다. 이 경우 규칙을 못 찾을 뿐 오탐은 없습니다("규칙 없음"으로 표시).
- 프로덕션 빌드(해시만 남는 경우)는 대상이 아닙니다. 속성 주입 자체가 개발 서버 전용입니다.
- `composes`, `:global(...)`, CSS-in-JS, Tailwind 유틸리티 클래스는 아직 지원하지 않습니다.
- 규칙이 없는 클래스에 새 규칙을 만드는 패치는 SFC 에서만 지원합니다(스타일시트에는 안전하게 덧붙일 고정 앵커가 없음). 기존 규칙이 있으면 스타일시트에도 선언을 수정·추가합니다.

## 3. 벤치마크

`apps/playground-react` 는 Vue playground 와 같은 가로 오버플로우 4건과 정상 대조군 2건을 심었고, 스타일 방식을 일부러 섞었습니다.

| 컴포넌트 | 결함 | 스타일 방식 |
| --- | --- | --- |
| `ProductCard` | flex item min-width + nowrap 제목 | CSS Modules (`.module.scss`) |
| `TagList` | flex-shrink:0 태그 | 일반 `.css` |
| `PromoBanner` | 고정 너비 420px | 일반 `.scss` |
| `ShareLink` | 공백 없는 긴 URL | CSS Modules (`.module.css`) |
| `OrderTable`, `BadgeCard` | (정상 대조군) | `.css`, CSS Modules |

벤치마크(`pnpm bench`)가 React 앱을 별도 서버로 띄워 재현율·정밀도 100%, 대조군 오탐 0, 1280px 결함 0, JSX 소스 매핑 정확도, 그리고 규칙 기반 패치가 **정답 스타일시트를 수정 대상으로 잡는지**(`styleFile`)를 게이트로 검사합니다.
`ProductCard` 는 Vue 판과 마찬가지로 복합 원인이라 규칙 기반 단독 치유는 실패하지만(기존 기준선과 동일), 수정 대상 파일은 정확히 찾습니다.
