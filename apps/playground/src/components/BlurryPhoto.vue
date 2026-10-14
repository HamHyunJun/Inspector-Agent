<template>
  <figure class="blurry">
    <img class="blurry__img" src="../assets/small.png" alt="저해상도 상품 사진" />
  </figure>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 원본 80px 이미지를 카드 너비로 늘려 그려 흐릿하다(비율은 유지). 768px 이상에서는 원본 크기로 그려 선명하다
.blurry {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    width: 100%;
    height: auto;

    @media (min-width: 768px) {
      width: 80px;
    }
  }
}
</style>
