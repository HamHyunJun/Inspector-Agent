<template>
  <figure class="retina">
    <img class="retina__img" src="../assets/retina.png" alt="상품 사진" />
  </figure>
</template>

<style lang="scss" scoped>
// [환경 정답: 실기기 프로필] 원본 400px 이미지를 카드 너비로 그린다. 화면 배율 1배에서는 선명하지만 3배 화면(iPhone)에서는 약 960px 가 필요해 흐려진다
.retina {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    width: 100%;
    height: auto;

    // 넓은 화면에서는 원본(400px)보다 작게 그려 화면 배율 1배에서도 선명하다
    @media (min-width: 768px) {
      width: 320px;
    }
  }
}
</style>
