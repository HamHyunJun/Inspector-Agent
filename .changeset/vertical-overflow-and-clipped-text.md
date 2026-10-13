---
"@inspector-agent/core": minor
"@inspector-agent/verifier": minor
"@inspector-agent/mcp-server": minor
---

탐지 규칙 두 가지를 추가했다.

- `overflow-y`(세로 오버플로우): 높이가 고정된 컨테이너(`overflow-y: visible`) 밖으로 흐름 안 콘텐츠가 넘쳐 아래 요소와 겹치는 경우. 스크롤·잘림 컨테이너, 절대 위치 팝업, float, 변환된 자식은 제외한다. 진단은 `fixed-height`(`height: auto` + `min-height`)와 `vertical-scroll`(`overflow-y: auto`)
- `clipped-text`(텍스트 잘림): `overflow: hidden` 인데 `text-overflow: ellipsis` 가 없어 글자가 잘렸다는 표시 없이 사라지는 경우. input, 말줄임, line-clamp, sr-only, 마스크 페이드, 마퀴, 캐러셀 카드는 제외한다. 진단은 `text-ellipsis` 와 `text-wrap`

가려짐 검사에서 표본점 5개가 모두 화면 안에 들어오도록 스크롤해 페이지 길이에 따라 판정이 흔들리던 문제도 고쳤다.
