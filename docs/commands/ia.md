---
description: Inspector-Agent 스캔 후 미해결 결함 패치 제안 (/ia scan [url] · /ia status)
argument-hint: scan [url] | status
allowed-tools: mcp__inspector-agent__scan_page, mcp__inspector-agent__list_defects, mcp__inspector-agent__get_defect_context, mcp__inspector-agent__propose_patch, mcp__inspector-agent__get_patch_status
---

인자: `$ARGUMENTS`

첫 단어로 동작을 정한다. 비어 있으면 `scan` 으로 본다.

## scan [url]
1. url 이 없으면 실행 중인 개발 서버를 찾는다. 5173, 3000, 3001, 5174, 4173, 8080, 4321 순으로 `lsof -nP -iTCP:<포트> -sTCP:LISTEN` 으로 확인하고, 여러 개면 이 프로젝트 폴더에서 실행 중인 것을 고른다. 그래도 하나로 못 정하면 후보를 보여 주고 어느 것인지 한 번만 묻는다. 대시보드 포트(inspector-agent 의 `INSPECTOR_DASHBOARD_URL`)는 제외한다.
2. `scan_page` 로 스캔한다. 기본 뷰포트와 자동 탐색(툴팁·팝오버·모달을 눌러/올려 본 상태)이 켜져 있으니 viewports 와 시나리오는 넘기지 않는다.
3. `list_defects` 로 미해결 결함을 심각도 순으로 읽는다. 같은 소스 위치는 한 줄로 묶여 있으니 한 번만 처리한다.
4. 결함마다 `get_defect_context` 로 컨텍스트를 읽고 `propose_patch` 로 패치를 **제안만** 한다. 제안이 끝나면 `get_patch_status` 로 상태를 확인한다.
5. 파일은 직접 고치지 않는다. 적용·검증은 사람이 대시보드에서 승인한다.
6. 끝에 한국어로 요약한다: 스캔한 URL, 결함 수, 제안한 패치 수, 제안하지 못한 결함과 이유(소스 정보 없음, 구조 변경 필요 등), 대시보드에서 검토할 것.

## status
`list_defects` 로 미해결 결함과, 있으면 `get_patch_status` 로 패치 상태를 보여 준다. 스캔은 하지 않는다.

그 밖의 인자는 사용법(`/ia scan [url]`, `/ia status`)만 한 줄로 알려 준다.
