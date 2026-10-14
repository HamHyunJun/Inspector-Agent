<template>
  <button class="shadow-ring" type="button">저장</button>
</template>

<style lang="scss" scoped>
// [환경 정답: 고대비] 포커스 표시를 box-shadow 로만 그렸다. 일반 화면에서는 보이지만 윈도우 고대비(forced-colors)에서는 그림자가 사라져 포커스 표시가 없어진다
// (고치는 법: outline: 2px solid transparent 를 함께 둔다. 고대비에서는 transparent 가 시스템 색으로 보인다)
.shadow-ring {
  height: 44px;
  min-width: 96px;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 3px #0969da;
  }
}
</style>
