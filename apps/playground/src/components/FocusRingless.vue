<template>
  <button class="ringless" type="button">저장</button>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 outline: none 만 쓰고 대체 포커스 표시가 없어 Tab 으로 와도 어디인지 보이지 않는다. 768px 이상에서는 숨긴다
.ringless {
  height: 44px;
  min-width: 96px;
  outline: none;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
