# 면접 예상 질문 15개

코드 위치는 작성 시점(`main`) 기준 `파일:라인`이다. 수치는 `INSPECTOR_BENCH_ESTIMATE=1 pnpm bench` 실행 결과(`benchmarks/results/latest.json`)이며, **토큰 수는 4자당 1토큰 근사치**다(`ANTHROPIC_API_KEY` 가 없는 환경에서 측정, 실제 토크나이저 수치가 아니다). 정답표는 이 프로젝트가 직접 심은 데모 결함이라 범용 정확도 주장이 아니라 회귀 테스트로 봐야 한다.

## 문제 정의

### 1. Chrome DevTools MCP 로 충분하지 않나?
DevTools MCP 는 에이전트에게 **눈**(DOM, 스크린샷, 계산된 스타일)을 준다. 부족한 것은 세 가지다.

1. **어디가 깨졌는지**: 눈으로 본 것을 LLM 이 추측한다. 여기서는 규칙이 수치로 판정하고 LLM 호출이 0회다 (`packages/core/src/detector.ts:122` `detect`).
2. **그 노드가 어느 파일 몇 줄인지**: DOM 에는 소스 위치가 없어 클래스명 grep 추측이 된다. Vite 플러그인이 `data-ia-src="파일:라인:컬럼"` 을 주입하고(`packages/vite-plugin/src/inject.ts:27`), 그 클래스를 스타일링하는 규칙 라인까지 찾는다(`packages/source-locator/src/index.ts:139` `locateStyleRules`).
3. **고쳐졌는지**: "고쳤습니다"는 LLM 의 주장이다. 같은 뷰포트로 재측정해 0px 이고 새 결함이 없을 때만 통과시킨다(`packages/verifier/src/index.ts:136` `measureDefect`).

**토큰도 다르다.** 같은 페이지를 전부 넘기면 DOM+레이아웃 스타일 25,771 토큰, 전체 ComputedStyle 478,585 토큰이다. Inspector 컨텍스트는 결함 11건 합계 4,820 토큰(결함당 438)으로 레이아웃 덤프 대비 81.3%, 전체 덤프 대비 99.0% 적다(근사치).
DevTools MCP 와 경쟁이 아니라 **보완**이다. 이 도구의 MCP 도구는 5개뿐이고(`packages/mcp-server/src/index.ts:37`~) 눈이 필요하면 DevTools MCP 를 함께 쓰면 된다.

### 2. 왜 LLM 이 아니라 결정론적 규칙으로 탐지했나?
탐지는 "있다/없다" 판정이라 재현성이 가장 중요하다. 같은 페이지는 항상 같은 결과여야 CI 게이트(`pnpm bench` 종료 코드, `benchmarks/src/gate.ts:25`)와 패치 전후 비교(검증 루프)가 성립한다. LLM 판정은 비결정적이라 "고쳐졌는가"의 기준으로 쓸 수 없다. LLM 은 **원인을 읽고 패치를 쓰는 데**만 쓴다.

### 3. 결정론적 탐지의 한계는?
규칙이 아는 것만 찾는다. 실제로 확인한 한계다.

- **범위 밖 결함은 못 찾는다.** 지원 범위는 가로·세로 오버플로우, 텍스트 잘림, 가려짐, 모달 포커스 이탈이다. 색 대비, 라벨 누락 같은 접근성 규칙은 없다 (README 8장).
- **스캔 시점에 DOM 에 있는 것만 본다.** 닫힌 드롭다운, 데이터가 있어야 그려지는 화면은 안 보인다. Camping-Joy 에서 빈 상태 13개 URL 이 전부 0건이었다(`docs/real-world-report.md` I2). 그래서 시드+클릭 시나리오 기능을 만들었다(`packages/core/src/scenario.ts`).
- **의도와 결함을 구분 못 한다.** 조상이 `overflow: auto` 면 의도된 스크롤로 제외한다(`detector.ts:140`). 그래서 `overflow-x: auto` 칩 목록에서 잘려 보이는 칩은 놓친다(리포트 M1).
- **오탐은 규칙의 가정이 깨질 때 난다.** 아래 11번.
- **정확도 수치는 자작 정답표 기준**이다. 11건 재현율·정밀도 100%, 대조군 오탐 0건이지만 실서비스 일반화 수치가 아니다.

그래서 오탐/미탐을 발견하면 대조군으로 고정하고 게이트가 막게 하는 운영 절차를 README 에 적었다.

### 4. 검증 루프가 왜 필요한가?
LLM 패치는 "그럴듯하지만 틀린" 경우가 흔하고, 고친 곳이 다른 곳을 깨는 회귀도 있다. 실제 벤치마크가 이를 보여 준다.

- `ProductCard` 는 `min-width: 0` 만 넣으면 박스 오버플로우는 사라지지만 nowrap 제목이 박스를 넘치는 **새 결함**이 생긴다. 재측정이 이를 잡아 자동 롤백했다(`apps/dashboard/server/utils/patch-service.ts:102`~104).
- 규칙 기반 치유 8건 중 7건이 최종 통과, **재측정으로 잡은 회귀 2건**(첫 시도 성공 5건). 검증이 없었다면 2건은 "고쳤다"고 보고됐을 것이다.

통과 조건은 `remaining === undefined && regressions.length === 0` 둘 다다(`verifier/src/index.ts:155`). 대상만 사라지고 새 결함이 생기면 실패다.

## 설계

### 5. 노드 → 소스 라인 매핑을 왜 속성 주입으로 했나?
소스맵은 JS 위치만 알려 주고 DOM 노드의 템플릿 위치는 모른다. 개발 서버에서 템플릿 요소마다 `data-ia-src` 를 주입하면 브라우저 안에서 DOM 만 읽어 매핑되고(`fingerprint.ts:17` `parseSourceAttribute`), 프레임워크와 무관하다. Vue 는 `@vue/compiler-sfc` 로 파싱하고, React 는 `@babel/parser` 로 소문자 JSX 요소에 같은 속성을 넣는다(`packages/vite-plugin/src/inject-react.ts`). 개발 서버 전용(`apply: 'serve'`)이라 프로덕션 번들에 속성이 들어가지 않는다.
실측 정확도: 탐지된 11건 모두 노드 태그와 라인이 일치(11/11)한다.

### 6. React 는 왜 `fiber._debugSource` 가 아니라 속성 주입인가?
같은 앱에서 직접 비교했다(`docs/react-source-mapping.md`). React 19 에서는 `_debugSource` 가 `null` 이고, 확장 프로그램 content script 는 격리된 월드라 fiber 키가 0개로 보인다. `@vitejs/plugin-react` 6 은 Vite 8 이 필요하고 Babel 을 쓰지 않는다. 속성 주입은 DOM 속성이라 모든 환경에서 같고, 탐지기·대시보드를 바꾸지 않아도 된다.

### 7. 왜 모노레포로 패키지를 나눴나? 의존 방향은?
`core`(브라우저에서 도는 순수 탐지·진단) → `verifier`(Playwright 재측정) → `mcp-server`·`dashboard`. `source-locator`(소스 파일 분석)는 브라우저와 무관하게 분리했다. core 는 DOM 에서 도는 코드와 DOM 없는 순수 판정을 분리해, 판정 로직(`cascade.ts:35`, `occlusion.ts:88`, `diagnose.ts:19`)을 DOM 없이 단위 테스트한다. 현재 `packages/core` 테스트 104개 등 전체 패키지 테스트가 이 분리 덕에 빠르게 돈다.

### 8. 결함 타입을 왜 `kind` 로 구분되는 합집합으로 만들었나?
가로 오버플로우, 세로, 잘림, 가려짐, 포커스는 측정값 형태가 다르다(px, 비율, 방향 수). 하나의 구조에 선택 필드를 늘리면 소비처마다 `undefined` 검사가 퍼진다. `Defect` 를 `kind` 판별 합집합으로 두면 컴파일러가 분기 누락을 잡는다(`packages/core/src/types.ts`). 새 규칙(세로 오버플로우, 잘림)을 추가할 때 소비처 컴파일 오류로 고칠 곳을 알 수 있었다.

## 신뢰성·안전

### 9. LLM 이 임의 파일을 고치게 두면 위험하지 않나?
세 겹으로 막는다.

- **경로 제한**: 모든 파일 접근은 프로젝트 루트 안으로 제한하고 `node_modules` 는 거부한다(`apps/dashboard/server/utils/project-files.ts:10` `resolveProjectPath`).
- **편집 형식**: 패치는 "정확히 한 번 등장하는 oldText → newText" 쌍이다. 0번 또는 2번 이상 등장하면 전체 거부(`packages/core/src/patch.ts:22` `applyEdits`). 파일이 제안 이후 바뀌었으면 해시 불일치로 409(`patch-service.ts:85`).
- **자동 롤백**: 검증 실패 시 백업으로 복원(`patch-service.ts:104`). 에이전트가 사람 승인 없이 적용하는 자율 모드는 `INSPECTOR_ALLOW_AGENT_APPLY=1` 로만 켜진다.

### 10. 대시보드가 로컬 파일을 쓰는데 웹에서 악용되지 않나?
CORS 를 열지 않고, 요청 Host 가 루프백이 아니면 거부하며(DNS 리바인딩 방어), 쓰기 메서드는 Origin 이 같은 호스트거나 확장 프로그램일 때만 허용한다(`apps/dashboard/server/utils/request-guard.ts:29` `checkApiRequest`). 다른 주소로 열려면 `INSPECTOR_ALLOWED_HOSTS` 에 명시해야 한다. 시나리오에 비밀번호·토큰을 넣지 말라는 경고도 UI 에 있다(저장소에 평문 저장).

## 실서비스·벤치마크

### 11. 실서비스에 적용해 봤나? 무엇을 발견했나?
Camping-Joy(Nuxt 4)에 적용해 3개 뷰포트 × 13개 URL = 39회를 스캔하고 같은 39장을 스크린샷으로 육안 대조했다(`docs/real-world-report.md`). **탐지 규칙은 수정하지 않고 관찰한 그대로** 기록한 뒤 고쳤다.

- 정탐 1개 원인(1280px 에서 긴 영문 이름이 알약을 넘쳐 배지를 밀어냄), **오탐 3개 원인**(대시보드 12건): `transform: rotate()` 한 chevron 아이콘. `getBoundingClientRect` 는 변환 후 사각형을 돌려줘서 레이아웃 박스는 부모 안인데 밖으로 보였다.
- 수정: 자신이나 부모에 `transform/rotate/scale/translate` 가 있으면 박스 판정을 건너뛴다(`detector.ts:184`, `dom-utils.ts:16`). 재현 컴포넌트를 정상 대조군으로 추가하고 재검증했다. 한계(변환된 요소의 진짜 오버플로우는 박스 판정으로 못 잡음)는 `shortcut:` 주석에 남겼다.
- 통합 문제도 발견: Nuxt 4 는 Vite root 가 `app/` 이라 소스 경로 접두어가 어긋났고(I1), 빈 상태 스캔은 무의미했다(I2 → 시나리오 기능으로 이어짐).

### 12. 벤치마크는 어떻게 설계했고 무엇을 보증하나?
정답표(`benchmarks/src/fixtures.ts`)에 결함 11건과 정상 대조군을 두고 `pnpm bench` 가 불변 조건이 깨지면 종료 코드 1 로 끝난다(`gate.ts:25`). 결과(Vue 대상): 재현율 100%, 정밀도 100%, 대조군 오탐 0건, 1280px 결함 0건, 1순위 원인 진단 일치 11/11, 소스 매핑 11/11, 노드 174개 탐지 약 15ms. React 앱(`apps/playground-react`)은 별도 서버로 같은 검사를 하고 정답 스타일시트를 수정 대상으로 잡는지까지 게이트로 본다.
**테스트가 헛돌지 않는지**는 규칙을 일부러 끄거나 `moduleLocalName` 을 망가뜨려 bench 가 exit 1 이 되는지로 확인했다. 단, 정답표가 자작이라 범용 정확도로 말하면 안 된다.

### 13. 규칙 기반 자가 치유 성공률 87.5% 는 어떻게 해석하나?
패치 가능 8건 중 7건이 최종 통과, 첫 시도 성공 5건이다. 조상 요소·구조 변경·JS 가 필요한 3건(가려짐 2, 포커스 이탈 1)은 규칙으로 못 고치고 **참조 패치(사람이 고치는 방식)가 검증 루프를 통과하는지**만 확인했다(3/3). 실패 1건(`ProductCard`)은 복합 원인이라 규칙 단독으로 못 고치는 예다. 이는 LLM 이 없는 **기준선**이며, LLM 패치가 이보다 나은지 비교하는 용도다. 에이전트 자율 모드 3회 반복 기록(`benchmarks/results/agent-healing.md`)은 같은 세션 반복이라 독립성이 없어 **성능 추정이 아니라 파이프라인 동작 기록**으로만 쓴다.

## 심화

### 14. 같은 결함이 여러 URL·뷰포트에서 나오면 어떻게 처리하나?
소스 위치+종류+뷰포트로 지문(fingerprint)을 만들어(`fingerprint.ts:27`) URL 과 무관하게 한 그룹으로 묶고(`group.ts:24`) 발생 URL 목록을 보여 준다. 저장소의 결함 id 는 URL 별로 유지해 URL 별 검증·기준선은 보존한다. 한 원인이 뒤 형제를 밀어낸 경우는 앞 형제 하나로 묶고 나머지는 "연쇄 결함"으로 표시한다(`cascade.ts:35`). 둘 다 벤치마크 게이트(그룹·연쇄 불일치 0건)로 고정했다.

### 15. 다음에 무엇을 하겠나? / 이 프로젝트의 가장 큰 약점은?
가장 큰 약점은 **검증의 외부 타당성**이다. 정답표가 자작이고 실서비스는 Camping-Joy 한 곳이라, 다른 프로젝트에서의 재현율은 모른다. 우선순위:

1. 오픈소스 서비스 여러 개에 적용해 오탐·미탐을 같은 방식으로 기록하고 대조군으로 환원한다.
2. `ANTHROPIC_API_KEY` 로 `count_tokens` 실측을 돌려 토큰 수치를 근사치에서 실측으로 바꾼다 (코드는 이미 있음, `benchmarks/src/tokens.ts`).
3. LLM 패치 성공률을 규칙 기준선과 같은 정답표로 반복 측정한다 (독립 실행 여러 번).
4. Tailwind·CSS-in-JS 등 스타일 방식과 접근성 규칙(대비, 라벨) 확장.
