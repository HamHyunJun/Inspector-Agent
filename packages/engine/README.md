# @inspector-agent/engine

[Inspector-Agent](https://github.com/HamHyunJun/Inspector-Agent)의 **패치 엔진**입니다. 스캔 결과 저장, 소스 컨텍스트, 패치 **제안 → 사람 승인 → 적용 → 같은 화면 재측정 → 실패 시 자동 롤백**을 이 패키지가 맡고, MCP 서버(`@inspector-agent/mcp-server`)와 `inspector-agent` CLI 가 같은 엔진을 씁니다.

## CLI

```bash
npx -y @inspector-agent/engine fix http://localhost:5173      # 스캔 → 규칙 기반 패치 제안 → Diff 확인 → y/N → 적용·재측정(실패하면 자동 롤백)
npx -y @inspector-agent/engine apply p_abc123                 # AI 가 MCP 로 제안한 패치를 사람이 승인해 적용
npx -y @inspector-agent/engine rollback p_abc123              # 적용된 패치를 원본으로 되돌림(적용 뒤 파일을 더 고쳤으면 거부)
```

| 옵션 | 설명 |
| --- | --- |
| `--viewports 375,768x1024` | (fix) 검사할 화면 너비. 기본은 320·375·414·768·1024·1280 |
| `--yes` | 묻지 않고 적용. 재측정 실패는 그대로 자동 롤백됩니다 |

프로젝트 루트는 **현재 폴더**이고 데이터(`store.json`, 롤백용 백업)는 `<루트>/.inspector-agent/`에 저장됩니다(이 폴더는 스스로 git 에서 제외됩니다). 바꾸려면 환경 변수 `INSPECTOR_PROJECT_ROOT`, `INSPECTOR_DATA_DIR`, `INSPECTOR_SETTLE_MS`(적용 후 HMR 대기, 기본 800ms), `INSPECTOR_CHROMIUM_PATH` 를 쓰세요. 대화형 터미널이 아니면 `--yes` 가 없을 때 제안만 저장하고 끝납니다.

## API

```ts
import { createEngine, configFromEnv } from '@inspector-agent/engine'

const engine = createEngine(configFromEnv())
await engine.scan('http://localhost:5173')
const [group] = await engine.listGroups('open')
const patch = await engine.proposeRulePatch(group.defect.id)   // 파일은 아직 바뀌지 않음
const result = await engine.applyPatch(patch.id)               // 적용 → 재측정 → 실패하면 자동 롤백
```

## 안전장치

- 모든 경로는 프로젝트 루트 안으로 제한합니다(루트 밖, `node_modules`, 루트 밖을 가리키는 심볼릭 링크 거부).
- 적용 전에 백업하고, 제안 이후 파일이 바뀌었으면 거부해 사용자의 변경을 덮어쓰지 않습니다.
- 재측정에 실패하거나 새 결함이 생기면, 측정 자체가 실패해도 원본으로 되돌립니다.
- 클릭해야 열리는 UI 의 결함은 저장된 시나리오로 재측정하고, 시나리오를 잃었으면 파일을 쓰기 전에 거부합니다.
