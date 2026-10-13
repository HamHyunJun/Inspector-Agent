# @inspector-agent/mcp-server

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
