<template>
  <figure class="oversized">
    <img class="oversized__img" src="../assets/big.png" alt="고해상도 상품 사진" />
  </figure>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 원본 1600px 이미지를 200px 로만 그려 필요 이상으로 크다(8배). 768px 이상에서는 카드 너비로 그려 적당하다
.oversized {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    width: 200px;
    height: auto;

    @media (min-width: 768px) {
      width: 100%;
    }
  }
}
</style>
