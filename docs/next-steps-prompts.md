# 다음 단계 요청 가이드 (Claude Code CLI)

한 번에 기능 하나씩 요청하고, 끝나면 diff를 직접 읽고 커밋하세요.
각 단계는 그대로 복사해 붙여 넣으면 됩니다. `<...>` 로 표시된 부분만 직접 채우세요.

## 요청할 때의 공통 규칙

- **무엇을**, **어디에**, **완료 기준**을 함께 적습니다.
- 마지막에 "테스트, 타입체크, 벤치마크 통과까지"를 붙입니다.
- 큰 작업은 먼저 "계획만 세워줘"로 요청하고, 계획을 확인한 뒤 "진행해줘"라고 합니다.
- 끝나면 "변경 내용을 면접에서 설명할 수 있게 요약해줘"로 마무리합니다.

---

## 0단계: 코드 이해 (먼저 꼭 하기)

```
이 저장소의 탐지 → 소스 매핑 → 패치 제안 → 재측정 → 롤백 흐름을
packages/core/src/detector.ts, packages/vite-plugin/src/inject.ts,
apps/dashboard/server/utils/patch-service.ts 중심으로 설명해줘.
코드는 수정하지 마.
```

```
inspector-agent MCP로 http://localhost:5173 을 스캔하고, 미해결 결함마다
get_defect_context를 읽어 propose_patch로 패치를 제안해줘. 파일은 직접 고치지 마.
```
→ 대시보드(localhost:3000)에서 적용하고 검증한 뒤, 확인이 끝나면 **롤백**하세요. playground의 결함은 벤치마크 정답입니다.

## 1단계: 실제 프로젝트 검증 (가장 중요)

```
<내 Vue 프로젝트 절대 경로, 예: /Users/hyunjun/Camping-Joy> 에 @inspector-agent/vite-plugin 을 붙이는 방법을 정리하고 적용해줘.
INSPECTOR_PROJECT_ROOT 를 그 경로로 대시보드를 띄워 375/768/1280px로 스캔한 뒤,
오탐(실제로는 문제없는 것)과 미탐(눈으로 보이는데 못 잡은 것)을
docs/real-world-report.md 에 표로 정리해줘. 탐지 규칙은 아직 고치지 마.
```

```
docs/real-world-report.md 에 정리된 오탐을 원인별로 묶어 우선순위를 정하고,
가장 많이 나온 원인부터 하나씩 detector.ts 규칙을 고쳐줘.
같은 상황을 재현하는 정상 대조군 컴포넌트를 playground 에 추가해줘.
벤치마크에서 대조군 오탐 0건이 유지되는지까지 확인해줘.
```

## 2단계: Nuxt 지원 보강

```
Nuxt 4 앱(app/ 디렉터리, layouts, 자동 import 컴포넌트)에서도 data-ia-src 가
올바른 파일:라인으로 주입되는지 확인하는 apps/playground-nuxt 를 만들고,
안 되는 부분을 vite-plugin 에서 고쳐줘. 단위 테스트를 추가해줘.
```

## 3단계: 새 결함 유형 - z-index 가림

```
계획만 세워줘: core 탐지기에 "모달/드롭다운이 다른 요소에 가려지는" 결함을
elementFromPoint 와 stacking context 분석으로 탐지하는 규칙을 추가하려고 해.
DefectKind 확장, 진단 규칙, 검증 루프에서의 판정 기준, playground 정답 결함까지 포함해서.
```

```
계획대로 진행해줘. 기존 overflow-x 구조를 따르고, 단위 테스트, 타입체크,
벤치마크(정답표에 새 결함 추가)까지 통과시켜줘.
```

## 4단계: 접근성 - 모달 포커스 트랩

```
role="dialog" 또는 aria-modal="true" 요소가 열렸을 때 Tab 키 포커스가
모달 밖으로 빠져나가는지 Playwright 로 검사하는 규칙을 verifier 에 추가해줘.
playground 에 정답 결함을 심고 벤치마크에 반영해줘.
```

## 5단계: CI 연동

```
inspector-scan CLI 에 --fail-on <high|medium|low> 옵션을 추가하고,
playground 를 띄워 스캔하는 GitHub Actions 워크플로를 만들어줘.
결함이 있으면 실패하고 요약을 job summary 에 남기게 해줘.
```

## 6단계: 수치 신뢰도 높이기

```
벤치마크의 토큰 수를 4자당 1토큰 근사 대신 실제 토크나이저 API로 측정하도록 바꾸고,
README 벤치마크 표를 새 결과로 갱신해줘.
```

```
INSPECTOR_ALLOW_AGENT_APPLY=1 자율 모드에서 에이전트가 playground 결함 4건을
제안 → 적용 → 재측정 → 실패 시 재제안하는 과정을 3회 반복 실행하고,
LLM 패치 성공률과 평균 시도 횟수를 benchmarks/results 와 README 에 기록해줘.
작업 후 playground 파일은 원래대로 되돌려줘.
```

## 마무리 요청 (매 단계 끝에)

```
이번 변경을 커밋 메시지(한국어)로 정리해서 커밋하고,
면접에서 "왜 이렇게 설계했나"를 설명할 수 있게 3줄로 요약해줘.
```
