<template>
  <aside class="cookie" aria-label="쿠키 안내">
    <p class="cookie__text">이 사이트는 쿠키를 사용합니다</p>
    <button class="cookie__accept" type="button">동의</button>
  </aside>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 화면 아래에 고정된 안내 띠가 화면 높이의 40% 를 차지해 본문을 가린다. 768px 이상에서는 숨긴다
.cookie {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 40vh;
  padding: 16px;
  background: #24292f;
  color: #fff;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }

  &__text {
    margin: 0;
  }

  &__accept {
    align-self: flex-start;
    min-width: 64px;
    height: 44px;
  }
}
</style>
