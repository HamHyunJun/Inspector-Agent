# @inspector-agent/core

## 0.6.0

### Minor Changes

- flex 줄 안의 아이콘·이미지가 줄어들어 비율이 깨지는 "찌그러짐"을 탐지합니다(예: 좁은 화면에서 24×24 원형 잠금 아이콘이 18×24 타원이 됨). 넘침도 잘림도 없어 기존 규칙으로는 잡히지 않던 결함이며, `flex-shrink: 0` 한 줄로 고치는 규칙 기반 패치를 제안합니다. `overflow-x` 결함의 `squished` 모드로 보고됩니다. 거의 0px 까지 줄어 사라질 만큼 찌그러진 아이콘도 잡습니다.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- 시나리오 없이도 툴팁·팝오버·드롭다운·모달을 스스로 열어 보는 자동 탐색을 추가했습니다(기본 켜짐, `--no-explore`/`explore: false` 로 끔). 열린 절대/고정 위치 요소가 화면 좌우 경계를 넘는 경우를 잡는 뷰포트 이탈 탐지(`overflow-x` 의 `viewport` 모드)와, 작은 화면을 촘촘히 보는 기본 뷰포트(320/375/414/768/1024/1280)도 함께 들어갑니다.

### Patch Changes

- 1029b4b: 시나리오에 `hover` 단계를 추가했습니다. 마우스를 올려야 나타나는 툴팁을 연 상태로 스캔할 수 있습니다.

## 0.2.0

### Minor Changes

- ceb1600: 탐지 규칙 두 가지를 추가했다.
  
  - `overflow-y`(세로 오버플로우): 높이가 고정된 컨테이너(`overflow-y: visible`) 밖으로 흐름 안 콘텐츠가 넘쳐 아래 요소와 겹치는 경우. 스크롤·잘림 컨테이너, 절대 위치 팝업, float, 변환된 자식은 제외한다. 진단은 `fixed-height`(`height: auto` + `min-height`)와 `vertical-scroll`(`overflow-y: auto`)
  - `clipped-text`(텍스트 잘림): `overflow: hidden` 인데 `text-overflow: ellipsis` 가 없어 글자가 잘렸다는 표시 없이 사라지는 경우. input, 말줄임, line-clamp, sr-only, 마스크 페이드, 마퀴, 캐러셀 카드는 제외한다. 진단은 `text-ellipsis` 와 `text-wrap`
  
  가려짐 검사에서 표본점 5개가 모두 화면 안에 들어오도록 스크롤해 페이지 길이에 따라 판정이 흔들리던 문제도 고쳤다.
