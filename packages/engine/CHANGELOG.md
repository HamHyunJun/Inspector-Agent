# @inspector-agent/engine

## 0.5.0

### Minor Changes

- 대시보드 없이 스캔 → 제안 → 사람 승인 → 적용 → 재측정 → 실패 시 자동 롤백을 합니다. 패치 적용 로직을 새 패키지 `@inspector-agent/engine` 으로 분리해 MCP 서버(`apply_patch` 는 승인 창으로 사람의 승인을 받음)와 `inspector-agent fix`/`apply`/`rollback` CLI 가 같은 엔진을 씁니다.
  
  **동작 변경(호환되지 않음)**: 대시보드(`apps/dashboard`), Chrome 확장, MCP 의 대시보드 모드(`INSPECTOR_DASHBOARD_URL`)와 `inspector-scan --report` 를 제거했습니다. MCP 서버는 항상 이 프로세스의 엔진으로 동작하고 결함 기록은 프로젝트의 `.inspector-agent/`(스스로 git 에서 제외)에 저장됩니다.

### Patch Changes

- @inspector-agent/core@0.5.0
  - @inspector-agent/verifier@0.5.0
