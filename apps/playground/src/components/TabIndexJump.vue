<template>
  <button class="jump" type="button" tabindex="2">바로 구매</button>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 tabindex="2" 가 Tab 순서를 문서 순서보다 앞당긴다. 768px 이상에서는 숨긴다
.jump {
  height: 44px;
  min-width: 96px;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
