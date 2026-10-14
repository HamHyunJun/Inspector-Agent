# @inspector-agent/mcp-server

Claude Code 같은 MCP 클라이언트가 [Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent)로 페이지를 **스캔하고, 결함의 컨텍스트를 읽고, 패치를 제안**하게 하는 stdio MCP 서버입니다. 에이전트는 이미 탐지·소스 매핑·측정된 결함을 받아 패치만 제안하고, 파일 반영과 재측정은 엔진(`@inspector-agent/engine`)이 사람의 승인을 받아 합니다. **대시보드나 별도 서버가 필요 없습니다.**

## 설치와 연결

Claude Code 의 `.mcp.json`:

```json
{
  "mcpServers": {
    "inspector-agent": {
      "command": "npx",
      "args": ["-y", "@inspector-agent/mcp-server"]
    }
  }
}
```

Node 20 이상. 전역 설치를 원하면 `npm install -g @inspector-agent/mcp-server` 후 `command` 를 `inspector-agent-mcp` 로 쓰세요.

## 슬래시 명령

MCP 서버가 프롬프트 `scan`, `status` 를 노출하므로 연결만 하면 Claude Code 에 `/mcp__inspector-agent__scan [url]` 과 `/mcp__inspector-agent__status` 가 나타납니다(스캔 → 미해결 결함마다 컨텍스트를 읽고 `propose_patch` 로 제안만 합니다).

짧은 `/ia`, `/insp` 를 쓰려면 한 번 실행하세요.

```bash
npx -y @inspector-agent/mcp-server install-commands            # ~/.claude/commands (모든 프로젝트)
npx -y @inspector-agent/mcp-server install-commands --project  # 현재 프로젝트의 .claude/commands
```

같은 이름의 다른 내용 파일이 있으면 건드리지 않고 알려 주며, 덮어쓰려면 `--force` 를 붙입니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `INSPECTOR_PROJECT_ROOT` | 현재 폴더 | 패치를 반영할 프로젝트 루트(결함 기록·백업은 `<루트>/.inspector-agent/`) |
| `INSPECTOR_DATA_DIR` | `<루트>/.inspector-agent` | 결함 기록과 롤백용 백업 위치 |
| `INSPECTOR_SETTLE_MS` | `800` | 파일 반영 후 재측정 전 HMR 대기(ms) |
| `INSPECTOR_ALLOW_AGENT_APPLY` | 미설정 | `1` 이면 `apply_patch` 가 승인 창 없이 적용(자율 모드). 전용 브랜치에서만 쓰세요 |

## 도구

| 도구 | 설명 |
| --- | --- |
| `scan_page` | URL 을 여러 뷰포트에서 스캔. `scenario`/`scenarioFile` 로 시드와 클릭 단계를 줘서 데이터가 있어야 보이는 화면이나 열어야 보이는 UI 도 스캔 |
| `list_defects` | 결함을 심각도 순으로 요약(같은 소스 위치는 URL 이 달라도 한 줄) |
| `get_defect_context` | 결함의 수치, 템플릿 스니펫, SCSS 규칙 라인, 진단. 패치 전에 반드시 호출 |
| `propose_patch` | "정확히 한 번 등장하는 원문 → 새 내용" 편집을 제안(파일은 바뀌지 않음) |
| `get_patch_status` | 제안한 패치의 검토·적용·재측정 상태 |
| `apply_patch` | 사람의 승인(승인 창)을 받아 패치를 적용하고 같은 화면에서 재측정. 실패하면 자동 롤백 |

## 라이선스

MIT
