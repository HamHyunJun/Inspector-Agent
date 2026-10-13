# @inspector-agent/mcp-server

Claude Code 같은 MCP 클라이언트가 [Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent) 대시보드의 결함을 **조회하고, 컨텍스트를 읽고, 패치를 제안**하게 하는 stdio MCP 서버입니다. 에이전트는 이미 탐지·소스 매핑·측정된 결함을 받아 패치만 제안하고, 파일 반영과 재측정은 대시보드가 합니다.

> **대시보드가 필요합니다.** 이 서버는 대시보드 API(`http://localhost:3000`)를 호출하는 얇은 어댑터이고, 대시보드(`apps/dashboard`)는 npm 패키지가 아니라 저장소에서 실행합니다: `git clone https://github.com/HamHyunJun/Inspector-Agent && pnpm install && pnpm dev:dashboard`.

## 설치와 연결

Claude Code 의 `.mcp.json`:

```json
{
  "mcpServers": {
    "inspector-agent": {
      "command": "npx",
      "args": ["-y", "@inspector-agent/mcp-server"],
      "env": { "INSPECTOR_DASHBOARD_URL": "http://localhost:3000" }
    }
  }
}
```

Node 20 이상. 전역 설치를 원하면 `npm install -g @inspector-agent/mcp-server` 후 `command` 를 `inspector-agent-mcp` 로 쓰세요.

## 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `INSPECTOR_DASHBOARD_URL` | `http://localhost:3000` | 연결할 대시보드 주소 |
| `INSPECTOR_ALLOW_AGENT_APPLY` | 미설정 | `1` 이면 `apply_patch` 도구를 노출(사람 승인 없이 적용, 자율 모드). 전용 브랜치에서만 쓰세요 |

## 도구

| 도구 | 설명 |
| --- | --- |
| `scan_page` | URL 을 여러 뷰포트에서 스캔. `scenario`/`scenarioFile` 로 시드와 클릭 단계를 줘서 데이터가 있어야 보이는 화면이나 열어야 보이는 UI 도 스캔 |
| `list_defects` | 결함을 심각도 순으로 요약(같은 소스 위치는 URL 이 달라도 한 줄) |
| `get_defect_context` | 결함의 수치, 템플릿 스니펫, SCSS 규칙 라인, 진단. 패치 전에 반드시 호출 |
| `propose_patch` | "정확히 한 번 등장하는 원문 → 새 내용" 편집을 제안(파일은 바뀌지 않음) |
| `get_patch_status` | 제안한 패치의 검토·적용·재측정 상태 |
| `apply_patch` | (자율 모드 전용) 패치를 적용하고 같은 시나리오로 재측정 |

## 라이선스

MIT
