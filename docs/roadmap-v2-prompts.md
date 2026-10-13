# 로드맵 v2 요청 가이드 (Claude Code CLI)

v1(0~6단계)이 끝난 뒤의 작업 순서입니다. 순서는 **실제 사용에서 막힌 것 → 배포 → 범위 확장 → 포트폴리오 마감** 기준입니다.
`<...>` 부분만 직접 채우고 그대로 붙여 넣으세요.

## 매 단계 공통 루틴

시작할 때:
```
git pull 하고 feat/<작업이름> 브랜치를 만들어줘.
```

큰 작업은 계획부터:
```
계획만 세워줘. 코드는 아직 수정하지 마.
```

끝날 때:
```
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과하는지 확인하고,
한국어 커밋 메시지로 커밋한 뒤 main 에 병합하고 push 해줘. 병합한 브랜치는 원격에서도 지워줘.
면접에서 "왜 이렇게 설계했나"를 설명할 수 있게 3줄로 요약해줘.
```

---

## 1단계: 결과 노이즈 정리 (작음, 바로 효과)

`docs/real-world-report.md` 의 D1(형제 요소 중복), D2(URL만 다른 같은 결함 중복) 해결.

```
docs/real-world-report.md 의 D1, D2 중복 집계를 해결해줘.
D1: 같은 부모 안에서 한 원인이 밀어낸 형제 결함은 하나로 묶고 "연쇄 결함"으로 표시.
D2: 대시보드에서 같은 소스 위치·뷰포트 결함은 URL 이 달라도 한 그룹으로 보여주고 발생 URL 목록을 표시.
playground 에 재현 케이스를 추가하고 벤치마크 정답표도 갱신해줘.
```

## 2단계: 상태가 있는 화면 스캔 (실사용의 가장 큰 막힘)

Camping-Joy처럼 데이터가 있어야 그려지는 화면, 드롭다운·모달처럼 클릭 후에 나타나는 UI를 검사할 수 있게 합니다.

```
계획만 세워줘: 스캔 전에 상태를 준비하는 "시나리오" 기능을 추가하려고 해.
- localStorage/sessionStorage/쿠키 시드 주입
- 스캔 전 실행할 단계(클릭, 입력, 대기)를 JSON 으로 정의
- 같은 시나리오를 대시보드 /api/scan, inspector-scan CLI, MCP scan_page, 재측정 검증에서 모두 재사용
시나리오 파일 위치와 형식, 검증 루프에서 같은 상태를 재현하는 방법을 포함해줘.
```
```
계획대로 진행해줘. Camping-Joy 용 예시 시나리오(<시드 데이터 설명>)를 docs/scenarios/ 에 추가하고,
드롭다운이 열린 상태를 스캔하는 playground 케이스도 벤치마크에 넣어줘.
```

## 3단계: Chrome 확장 실사용 검증

```
packages/extension 을 실제 Chrome 에 로드해서 동작을 확인하는 절차를 docs/extension-testing.md 로 정리하고,
Playwright 의 launchPersistentContext 로 확장을 로드해 popup 스캔 → 대시보드 전송까지 검사하는 E2E 테스트를 추가해줘.
가능하면 chrome.debugger 로 375px 뷰포트 에뮬레이션도 지원해줘.
```

## 4단계: npm 배포

```
계획만 세워줘: vite-plugin, mcp-server, verifier(CLI), core 를 npm 에 배포하려고 해.
- 패키지 이름이 npm 에 비어 있는지 확인 (@inspector-agent 스코프를 쓸 수 있는지, 안 되면 대안 이름)
- changesets 로 버전 관리, 각 package.json 의 files/exports/bin/repository/license 정리
- 배포용 README(패키지별), LICENSE(MIT)
- GitHub Actions 로 태그 시 자동 배포 (NPM_TOKEN 은 내가 직접 등록)
배포 명령 자체는 실행하지 마.
```
```
계획대로 진행하고, npm pack 으로 만든 tarball 을 임시 Vite 프로젝트에 설치해서 동작하는지까지 확인해줘.
실제 publish 는 하지 마.
```
→ 마지막 `npm publish` 는 직접 실행하세요(로그인과 2FA 필요). 배포 후 Camping-Joy 의 `link:` 의존성을 버전 의존성으로 바꾸고 main 에 합치면 됩니다.

## 5단계: 탐지 범위 확장 (세로 오버플로우, 텍스트 잘림)

```
core 탐지기에 두 가지 규칙을 추가해줘.
1) 세로 오버플로우: 고정 높이 컨테이너 밖으로 콘텐츠가 넘치는 경우
2) 의도치 않은 텍스트 잘림: overflow:hidden 인데 text-overflow:ellipsis 가 없어 글자가 잘리는 경우 (input 제외)
기존 overflow-x 구조를 따르고, 정상 대조군을 포함한 playground 케이스와 벤치마크 정답표를 추가해줘.
```

## 6단계: React 지원

```
계획만 세워줘: React(Vite) 프로젝트에서도 DOM 노드를 소스 파일:라인으로 매핑하려고 해.
@vitejs/plugin-react 의 jsx dev source(__source) 또는 Babel 플러그인 방식 중 무엇이 나은지 비교하고,
CSS Modules / 일반 CSS 파일 규칙 라인 탐색을 source-locator 에 어떻게 추가할지 포함해줘.
```
```
계획대로 진행해줘. apps/playground-react 를 만들고 같은 4가지 오버플로우 결함을 심어 벤치마크에 포함해줘.
```

## 7단계: 포트폴리오 마감

```
README 를 포트폴리오용으로 다듬어줘.
- 맨 위에 30초 데모 GIF (Playwright 로 대시보드: 스캔 → 결함 상세 → 패치 적용 → 0px 검증 장면 녹화)
- Camping-Joy 실서비스 적용 사례(오탐 발견 → 규칙 수정 → 재검증) 요약
- 벤치마크 표는 count_tokens 실측치로 갱신 (ANTHROPIC_API_KEY 는 내가 설정해 둠)
```
```
docs/interview-qa.md 를 만들어줘. 이 프로젝트에 대해 면접관이 물을 법한 질문 15개와 답변을,
실제 코드 파일:라인과 벤치마크 수치를 근거로 작성해줘. 특히
"Chrome DevTools MCP 로 충분하지 않나?", "결정론적 탐지의 한계는?", "검증 루프가 왜 필요한가?" 는 꼭 포함.
```

---

### 순서를 바꿔도 되는 경우
- 공개(포트폴리오 제출)가 급하면: 1 → 4 → 7 먼저, 나머지는 이후에
- Camping-Joy 를 실제로 고치는 게 목적이면: 1 → 2 → 4 (npm 배포 후 main 에 정식 적용)
