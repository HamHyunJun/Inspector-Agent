<template>
  <section class="sticky-box">
    <h2 class="sticky-box__title">주문 요약</h2>
    <p class="sticky-box__text">제목이 스크롤에 붙도록 position: sticky 를 줬지만 조상의 overflow 가 막아 붙지 않습니다</p>
  </section>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 래퍼의 overflow-x: hidden 이 스크롤 컨테이너를 만들어 sticky 제목이 페이지 스크롤에 붙지 않는다. 768px 이상에서는 overflow 가 없어 정상이다
.sticky-box {
  overflow-x: hidden;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  @media (min-width: 768px) {
    overflow: visible;
  }

  &__title {
    position: sticky;
    top: 0;
    margin: 0 0 4px;
    background: #fff;
    font-size: 16px;
  }

  &__text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
