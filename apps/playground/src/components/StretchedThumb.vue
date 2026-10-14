<template>
  <figure class="thumb">
    <img class="thumb__img" src="../assets/thumb.png" alt="이번 주 추천 상품 사진" />
    <figcaption class="thumb__caption">이번 주 추천 상품</figcaption>
  </figure>
</template>

<style lang="scss" scoped>
// [결함 정답] 160×90 원본을 너비 100% + 높이 96px 로 그려 가로로 늘어난다 (넘침도 잘림도 없다). 768px 이상에서는 높이가 비율을 따라 정상이다
.thumb {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    width: 100%;
    height: 96px;

    @media (min-width: 768px) {
      width: 160px;
      height: auto;
    }
  }

  &__caption {
    margin-top: 8px;
    font-size: 14px;
  }
}
</style>
