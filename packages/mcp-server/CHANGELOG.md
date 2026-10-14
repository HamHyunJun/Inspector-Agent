# @inspector-agent/mcp-server

## 0.5.0

### Minor Changes

- 대시보드 없이 스캔 → 제안 → 사람 승인 → 적용 → 재측정 → 실패 시 자동 롤백을 합니다. 패치 적용 로직을 새 패키지 `@inspector-agent/engine` 으로 분리해 MCP 서버(`apply_patch` 는 승인 창으로 사람의 승인을 받음)와 `inspector-agent fix`/`apply`/`rollback` CLI 가 같은 엔진을 씁니다.
  
  **동작 변경(호환되지 않음)**: 대시보드(`apps/dashboard`), Chrome 확장, MCP 의 대시보드 모드(`INSPECTOR_DASHBOARD_URL`)와 `inspector-scan --report` 를 제거했습니다. MCP 서버는 항상 이 프로세스의 엔진으로 동작하고 결함 기록은 프로젝트의 `.inspector-agent/`(스스로 git 에서 제외)에 저장됩니다.

### Patch Changes

- Updated dependencies
  - @inspector-agent/engine@0.5.0
  - @inspector-agent/core@0.5.0

## 0.4.0

### Minor Changes

- MCP 서버가 슬래시 명령 프롬프트(`scan`, `status`)를 직접 노출해, 연결만 하면 Claude Code 에서 `/mcp__inspector-agent__scan` 으로 스캔부터 패치 제안까지 실행할 수 있습니다. 짧은 `/ia`, `/insp` 는 `npx -y @inspector-agent/mcp-server install-commands` 한 줄로 설치합니다(`--project`, `--force` 지원).

### Patch Changes

- @inspector-agent/core@0.4.0

## 0.3.0

### Minor Changes

- 시나리오 없이도 툴팁·팝오버·드롭다운·모달을 스스로 열어 보는 자동 탐색을 추가했습니다(기본 켜짐, `--no-explore`/`explore: false` 로 끔). 열린 절대/고정 위치 요소가 화면 좌우 경계를 넘는 경우를 잡는 뷰포트 이탈 탐지(`overflow-x` 의 `viewport` 모드)와, 작은 화면을 촘촘히 보는 기본 뷰포트(320/375/414/768/1024/1280)도 함께 들어갑니다.

### Patch Changes

- 1029b4b: 시나리오에 `hover` 단계를 추가했습니다. 마우스를 올려야 나타나는 툴팁을 연 상태로 스캔할 수 있습니다.
- Updated dependencies
- Updated dependencies [1029b4b]
  - @inspector-agent/core@0.3.0

## 0.2.0

### Minor Changes

- 91c9a63: React(Vite) 프로젝트를 지원한다.
  
  - vite-plugin: `.jsx/.tsx` 의 소문자 JSX 요소에도 `data-ia-src="파일:라인:컬럼"` 을 주입한다. Vue 와 같은 속성·형식이라 탐지기는 그대로이고, `@vitejs/plugin-react` 의 버전·변환기(Babel/oxc)와 무관하다. `@babel/parser@7` 을 쓴다
  - mcp-server: 스타일 규칙에 `file` 이 붙어, 규칙이 JSX 와 다른 스타일시트(CSS Modules/.css/.scss)에 있으면 파일명을 함께 보여 준다
- ceb1600: 탐지 규칙 두 가지를 추가했다.
  
  - `overflow-y`(세로 오버플로우): 높이가 고정된 컨테이너(`overflow-y: visible`) 밖으로 흐름 안 콘텐츠가 넘쳐 아래 요소와 겹치는 경우. 스크롤·잘림 컨테이너, 절대 위치 팝업, float, 변환된 자식은 제외한다. 진단은 `fixed-height`(`height: auto` + `min-height`)와 `vertical-scroll`(`overflow-y: auto`)
  - `clipped-text`(텍스트 잘림): `overflow: hidden` 인데 `text-overflow: ellipsis` 가 없어 글자가 잘렸다는 표시 없이 사라지는 경우. input, 말줄임, line-clamp, sr-only, 마스크 페이드, 마퀴, 캐러셀 카드는 제외한다. 진단은 `text-ellipsis` 와 `text-wrap`
  
  가려짐 검사에서 표본점 5개가 모두 화면 안에 들어오도록 스크롤해 페이지 길이에 따라 판정이 흔들리던 문제도 고쳤다.

### Patch Changes

- Updated dependencies [ceb1600]
  - @inspector-agent/core@0.2.0
