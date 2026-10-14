<template>
  <div class="stack">
    <div class="stack__under" />
    <div class="stack__over" />
  </div>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 위에 보여야 할 파란 상자가 z-index 만 있고 position 이 static 이라 효과가 없어, position: relative 인 주황 상자에 덮인다. 768px 이상에서는 겹치지 않는다
.stack {
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__under {
    z-index: 10;
    width: 120px;
    height: 40px;
    background: #0969da;
  }

  &__over {
    position: relative;
    width: 120px;
    height: 40px;
    margin-top: -20px;
    background: #fb8500;

    @media (min-width: 768px) {
      margin-top: 8px;
    }
  }
}
</style>
