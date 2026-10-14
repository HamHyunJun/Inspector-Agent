# @inspector-agent/vite-plugin

## 0.7.0

### Minor Changes

- e5bd0ba: 탐지 규칙 대폭 추가(포커스 순서·고정 레이어·이미지·대비·탭 대상 등)와 환경 변형 스캔, 플레이그라운드 결함 케이스 확장

## 0.6.0

No changes in this release.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- 91c9a63: React(Vite) 프로젝트를 지원한다.
  
  - vite-plugin: `.jsx/.tsx` 의 소문자 JSX 요소에도 `data-ia-src="파일:라인:컬럼"` 을 주입한다. Vue 와 같은 속성·형식이라 탐지기는 그대로이고, `@vitejs/plugin-react` 의 버전·변환기(Babel/oxc)와 무관하다. `@babel/parser@7` 을 쓴다
  - mcp-server: 스타일 규칙에 `file` 이 붙어, 규칙이 JSX 와 다른 스타일시트(CSS Modules/.css/.scss)에 있으면 파일명을 함께 보여 준다
