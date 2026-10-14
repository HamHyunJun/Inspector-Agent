# @inspector-agent/engine

## 0.5.0

### Minor Changes

- 대시보드 없이 스캔 → 제안 → 사람 승인 → 적용 → 재측정 → 실패 시 자동 롤백을 합니다. 패치 적용 로직을 새 패키지 `@inspector-agent/engine` 으로 분리해 MCP 서버(기본: 독립 모드, `apply_patch` 는 승인 창으로 사람의 승인을 받음)와 `inspector-agent fix`/`apply` CLI, 대시보드가 같은 엔진을 씁니다.
  
  **동작 변경**: `INSPECTOR_DASHBOARD_URL` 이 없으면 MCP 서버가 대시보드 대신 독립 모드로 동작합니다(결함 기록은 프로젝트의 `.inspector-agent/`). 기존처럼 대시보드를 거치려면 `INSPECTOR_DASHBOARD_URL` 을 설정하세요.

### Patch Changes

- @inspector-agent/core@0.5.0
  - @inspector-agent/verifier@0.5.0
