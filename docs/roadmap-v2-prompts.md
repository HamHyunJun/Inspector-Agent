# 로드맵 v2 요청 가이드 (Claude Code CLI)

v1(0~6단계)이 끝난 뒤의 작업 순서입니다. 순서는 **실제 사용에서 막힌 것 → 배포 → 범위 확장 → 포트폴리오 마감** 기준입니다.
각 단계는 **요청문 하나로 계획 → 구현 → 검증 → 커밋·병합·푸시까지 한 번에** 진행됩니다. `<...>` 부분만 채워서 그대로 붙여 넣으세요.

> 모든 요청문 끝에 붙어 있는 **공통 마무리** 문단은 지우지 마세요. 그래야 테스트와 푸시가 빠지지 않습니다.

---

## 1단계: 결과 노이즈 정리

```
git pull 하고 feat/dedupe 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: docs/real-world-report.md 의 D1, D2 중복 집계 해결.
- D1: 같은 부모 안에서 한 원인이 밀어낸 형제 결함은 하나로 묶고 "연쇄 결함"으로 표시.
- D2: 대시보드에서 같은 소스 위치·뷰포트 결함은 URL 이 달라도 한 그룹으로 보여주고 발생 URL 목록을 표시.
- playground 에 재현 케이스를 추가하고 벤치마크 정답표도 갱신.

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```

## 2단계: 상태가 있는 화면 스캔 (실사용의 가장 큰 막힘)

```
git pull 하고 feat/scenarios 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: 데이터가 있어야 그려지는 화면과 클릭 후 나타나는 UI(드롭다운, 모달)를 스캔할 수 있게 "시나리오" 기능 추가.
- localStorage/sessionStorage/쿠키 시드 주입
- 스캔 전 실행할 단계(클릭, 입력, 대기)를 JSON 으로 정의
- 같은 시나리오를 대시보드 /api/scan, inspector-scan CLI, MCP scan_page, 패치 후 재측정에서 모두 재사용
- Camping-Joy 용 예시 시나리오(캠핑 3개, 멤버 4명, 긴 이름 포함)를 docs/scenarios/ 에 추가
- 드롭다운을 연 상태로 스캔하는 playground 케이스를 벤치마크에 추가

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```

## 3단계: Chrome 확장 실사용 검증

```
git pull 하고 feat/extension-e2e 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: packages/extension 이 실제 Chrome 에서 동작함을 자동으로 증명.
- Playwright launchPersistentContext 로 확장을 로드해 popup 스캔 → 대시보드 전송까지 검사하는 E2E 테스트 추가
- chrome.debugger 로 375px 뷰포트 에뮬레이션 옵션 추가
- 직접 로드해 보는 절차를 docs/extension-testing.md 로 정리

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```

## 4단계: npm 배포 준비

```
git pull 하고 feat/npm-release 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: vite-plugin, mcp-server, verifier(CLI), core 를 npm 에 배포할 수 있는 상태로 만들기.
- 패키지 이름이 npm 에 비어 있는지 확인하고, @inspector-agent 스코프를 못 쓰면 대안 이름을 골라 적용
- changesets 로 버전 관리, 각 package.json 의 files/exports/bin/repository/license 정리
- 패키지별 README, 루트 LICENSE(MIT)
- 태그 push 시 자동 배포하는 GitHub Actions (NPM_TOKEN 시크릿은 내가 직접 등록)
- npm pack tarball 을 임시 Vite 프로젝트에 설치해 동작 확인
- 실제 npm publish 는 절대 실행하지 말고, 내가 직접 실행할 배포 명령을 마지막에 알려줘

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```
→ 끝나면 안내받은 `npm publish` 명령만 직접 실행하세요(npm 로그인과 2FA 필요). 그다음 Camping-Joy 의 `link:` 의존성을 버전 의존성으로 바꾸면 main 에 합칠 수 있습니다.

## 5단계: 탐지 범위 확장 (세로 오버플로우, 텍스트 잘림)

```
git pull 하고 feat/vertical-and-clip 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: core 탐지기에 두 규칙 추가. 기존 overflow-x / occluded 구조를 따른다.
1) 세로 오버플로우: 고정 높이 컨테이너 밖으로 콘텐츠가 넘치는 경우
2) 의도치 않은 텍스트 잘림: overflow:hidden 인데 text-overflow:ellipsis 가 없어 글자가 잘리는 경우 (input 제외)
- 각 규칙의 진단 제안, 정상 대조군을 포함한 playground 케이스, 벤치마크 정답표 추가

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```

## 6단계: React 지원

```
git pull 하고 feat/react 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 구현까지 진행해줘.

목표: React(Vite) 프로젝트에서도 DOM 노드 → 소스 파일:라인 매핑과 스타일 규칙 라인 탐색 지원.
- @vitejs/plugin-react 의 jsx dev source 방식과 Babel 플러그인 방식을 비교해 나은 쪽 선택 (선택 이유를 docs/ 에 기록)
- source-locator 에 CSS Modules / 일반 .css·.scss 파일 규칙 라인 탐색 추가
- apps/playground-react 를 만들고 Vue playground 와 같은 오버플로우 결함 4건 + 대조군을 심어 벤치마크에 포함

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약과 면접용 "왜 이렇게 설계했나" 3줄 요약을 보여줘.
```

## 7단계: 포트폴리오 마감

```
git pull 하고 docs/portfolio 브랜치를 만든 뒤, 먼저 계획을 세우고 바로 이어서 진행해줘.

목표: 포트폴리오 제출용 마감.
- README 맨 위에 30초 데모 GIF: Playwright 로 대시보드 스캔 → 결함 상세 → 패치 적용 → 0px 검증 장면을 녹화해 docs/assets/ 에 저장
- README 에 Camping-Joy 실서비스 적용 사례(오탐 발견 → 규칙 수정 → 재검증) 요약 추가
- ANTHROPIC_API_KEY 가 설정돼 있으면 count_tokens 실측으로 벤치마크를 다시 돌려 README 표 갱신, 없으면 이 항목은 건너뛰고 알려줘
- docs/interview-qa.md: 면접 예상 질문 15개와 답변을 실제 코드 파일:라인과 벤치마크 수치를 근거로 작성.
  "Chrome DevTools MCP 로 충분하지 않나?", "결정론적 탐지의 한계는?", "검증 루프가 왜 필요한가?" 는 꼭 포함

공통 마무리: 중간에 나에게 묻지 말고 합리적인 기본값을 골라 진행하되, 고른 기본값은 마지막에 알려줘.
pnpm test, pnpm typecheck, INSPECTOR_BENCH_ESTIMATE=1 pnpm bench 가 모두 통과할 때까지 고친 뒤,
한국어 커밋 메시지로 커밋하고 main 에 병합해 push 하고, 병합한 브랜치는 원격에서도 지워줘.
마지막에 변경 요약을 보여줘.
```

---

### 순서를 바꿔도 되는 경우
- 포트폴리오 제출이 급하면: 1 → 4 → 7 먼저, 나머지는 이후에
- Camping-Joy 를 실제로 고치는 게 목적이면: 1 → 2 → 4 (npm 배포 후 main 에 정식 적용)

### 한 번에 끝나지 않았을 때
Claude Code 가 중간에 멈추거나 질문하면 이렇게 답하세요.
```
묻지 말고 네가 추천하는 쪽으로 진행해줘. 공통 마무리까지 끝내줘.
```
