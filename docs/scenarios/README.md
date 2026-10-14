# 스캔 시나리오

> 툴팁·팝오버·드롭다운·모달처럼 **누르거나 올려야 열리는 UI 는 시나리오 없이도 자동 탐색이 검사합니다**(기본 켜짐, 일부 버튼은 안전상 누르지 않음). 시나리오는 로그인·데이터 시드가 필요하거나 자동 탐색이 못 찾는 트리거를 직접 지정할 때 씁니다. 시나리오를 주면 자동 탐색은 꺼집니다.

헤드리스 스캔은 URL 만 열기 때문에 **데이터가 있어야 그려지는 화면**(빈 상태로 열면 결함 0건)과 **클릭해야 나타나는 UI**(드롭다운, 모달)는 검사하지 못합니다. 시나리오는 스캔 전에 페이지 상태를 만드는 JSON 입니다. 같은 JSON 을 대시보드, CLI, MCP, **패치 후 재측정**이 모두 그대로 씁니다.

## 형식

```json
{
  "name": "화면에 보일 이름 (선택)",
  "description": "설명 (선택)",
  "seed": {
    "localStorage": { "키": "문자열이면 그대로, 객체·배열·숫자는 JSON 으로 저장" },
    "sessionStorage": { "키": "값" },
    "cookies": [{ "name": "sid", "value": "abc", "path": "/" }]
  },
  "steps": [
    { "action": "click", "selector": ".trigger" },
    { "action": "hover", "selector": ".help-icon" },
    { "action": "fill", "selector": "input[name=q]", "value": "텐트" },
    { "action": "wait", "ms": 300 },
    { "action": "wait", "selector": ".menu" }
  ]
}
```

- `seed` 와 `steps` 중 하나 이상이 있어야 합니다.
- **seed**: 페이지가 뜨기 **전에** 심습니다(앱 코드가 읽기 전에 값이 있어야 하므로). 매 로드마다 시드 값으로 덮어써서 앱이 저장한 이전 상태가 결과를 흔들지 못합니다. 쿠키는 스캔하는 URL 의 호스트에만 설정되고 다른 도메인은 지정할 수 없습니다.
- **steps**: 페이지를 열고 안정화한 뒤 **탐지 전에** 순서대로 실행합니다. 단계 하나가 5초 안에 끝나지 않으면(셀렉터 오타 등) `시나리오 steps[N] (click .xxx) 실패` 로 스캔이 실패합니다.
  - `click` / `hover` / `fill`: Playwright 셀렉터(CSS). `hover` 는 마우스를 올려 툴팁처럼 hover 해야 나타나는 UI 를 엽니다
  - `wait`: `ms`(0~10000) 또는 `selector`(화면에 보일 때까지) 중 **하나**
- 한도: 단계 50개, 시드 합계 512KB, 셀렉터 300자. 알 수 없는 필드는 오타로 보고 거부합니다.
- **비밀번호, 토큰, 실제 세션 쿠키는 넣지 마세요.** 시나리오는 대시보드 저장소(`store.json`)에 평문으로 저장됩니다. 개발용 가짜 데이터만 쓰세요.

## 사용 방법

| 경로 | 방법 |
| --- | --- |
| CLI | `node packages/verifier/dist/cli.js http://localhost:5173 --scenario docs/scenarios/example-open-menu.json` |
| 대시보드 | 메인 화면 스캔 폼의 **시나리오** 를 펼쳐 JSON 을 붙여 넣고 **스캔 실행**, 또는 `POST /api/scan` 의 `scenario` 필드 |
| MCP (Claude Code) | `scan_page` 의 `scenarioFile: "docs/scenarios/example-open-menu.json"` (또는 `scenario` 로 JSON 을 직접) |
| 패치 후 재측정 | 따로 지정하지 않습니다. 시나리오로 스캔한 결함은 대시보드가 시나리오를 저장해 두었다가 **적용하고 검증** 때 같은 시나리오로 재측정합니다 |

CLI 에서 `--report` 로 대시보드에 보내면 시나리오도 함께 전송되어 같은 재측정이 됩니다.

### 시나리오 스캔은 일반 스캔과 별개로 기록됩니다

같은 URL 이라도 시나리오가 다르면 다른 화면 상태이므로 결함 id 에 시나리오 키(`s_xxxxxxxx`, 내용 해시)가 섞이고, 서로를 `resolved` 로 바꾸지 않습니다. 목록의 URL 그룹(같은 소스 위치·뷰포트)에는 함께 묶여 보입니다. 시나리오를 바꾸면(키가 달라지면) 새 결함으로 기록되므로 같은 시나리오 파일로 계속 스캔하세요. `name`, `description` 은 키에 영향을 주지 않습니다.

재측정이 왜 시나리오를 써야 하나: 닫혀 있는 드롭다운의 결함은 시나리오 없이 재측정하면 메뉴가 닫힌 화면을 재서 **고치기 전에도 "통과"** 로 나옵니다. 그래서 시나리오가 없는 결함 기록(스캔 때의 시나리오를 찾을 수 없는 경우)은 파일을 쓰기 전에 적용을 거부합니다.

## 예시

| 파일 | 내용 |
| --- | --- |
| [`example-seed.json`](example-seed.json) | `localStorage` 에 긴 이름이 섞인 목록 데이터를 심어, 데이터가 있어야 그려지는 화면을 스캔합니다 |
| [`example-open-menu.json`](example-open-menu.json) | 트리거를 클릭하고 메뉴가 보일 때까지 기다린 상태로 스캔합니다 |

```bash
node packages/verifier/dist/cli.js http://localhost:5173 --scenario docs/scenarios/example-open-menu.json
```

## 내 앱의 시나리오 만들기

1. **시드**: 브라우저 개발자 도구 Application 탭에서 앱이 쓰는 `localStorage` 키와 값 모양을 확인합니다(상태 라이브러리 영속 저장소는 보통 스토어 이름이 키). 값 모양을 복사해 긴 문자열 등 깨지기 쉬운 데이터로 바꿉니다.
2. **단계**: 열고 싶은 UI 의 트리거 셀렉터를 정하고(`data-*` 속성이나 안정적인 클래스), 열린 뒤에만 나타나는 요소를 `wait selector` 로 기다립니다. `ms` 대기는 애니메이션 전환 때만 쓰세요.
3. CLI 로 먼저 돌려 `시나리오 steps[N] … 실패` 없이 끝나는지 확인한 뒤 대시보드·MCP 에서 같은 파일을 씁니다.

## 열린 툴팁·팝오버가 화면 밖으로 나가는지 검사

`click`/`hover` 로 툴팁이나 팝오버를 연 상태에서 스캔하면, 절대/고정 위치 요소가 화면 좌우 경계를 넘는 경우를 **뷰포트 이탈**(`overflow-x` 의 `viewport` 모드, 진단 `keep-in-viewport`)로 보고합니다.

```json
{ "steps": [
  { "action": "click", "selector": ".security-badge__button" },
  { "action": "wait", "selector": "#security-popover" },
  { "action": "wait", "ms": 500 }
] }
```

- 열림 애니메이션(transform, opacity)이 끝나기 전에는 건너뛰므로 마지막에 `wait` 를 둡니다.
- 화면 밖으로 완전히 치워 둔 요소(오프캔버스 메뉴, 스킵 링크), `hidden`/`aria-hidden`/`inert`, `overflow` 로 자르는 조상 안의 요소는 의도된 것으로 보고 제외합니다.
- 위치를 정하는 CSS 는 앵커마다 달라 규칙 기반 자동 패치(선언)는 제안하지 않고 원인과 수정 방향만 안내합니다.
- 실측: TaxKit 의 "100% 로컬 연산" 팝오버는 390~480px 에서 최대 38px 화면 밖으로 나가는 것을 탐지했습니다(360px 이하, 600px 이상은 정상).
