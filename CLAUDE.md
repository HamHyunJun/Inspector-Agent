# Inspector-Agent 작업 규칙

- 모든 답변, 주석, 커밋 메시지는 한국어로 작성한다.
- 스택: Nuxt 4 + Vue 3 Composition API, pnpm 모노레포, SCSS(scoped), TypeScript.
- `.vue` 블록 순서: template → script setup lang="ts" → style lang="scss" scoped.
- script setup 순서: import → define → composable → interface/type → 변수 → lifecycle → computed → method → useHead → watch.
- 함수는 반환 타입을 명시한 화살표 함수. `null` 대신 `undefined` 또는 타입별 기본값.
- 시맨틱 태그 사용, div 남발 금지. form 은 `@submit.prevent`, label[for] ↔ input[id] 1:1, table 은 caption/thead/tbody/th[scope].
- 레이아웃 결함 수정 시 inspector-agent MCP 의 `get_defect_context` 로 컨텍스트를 읽고 `propose_patch` 로 제안한다. 파일을 직접 고치지 않는다.
- `apps/playground` 의 결함은 벤치마크 정답이므로 고치지 않는다.
