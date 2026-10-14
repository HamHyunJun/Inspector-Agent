<template>
  <figure class="thumb">
    <img class="thumb__img" src="../assets/thumb.png" alt="이번 주 추천 상품 사진 대조군" />
    <figcaption class="thumb__caption">비율을 지켜 채운 사진</figcaption>
  </figure>
</template>

<style lang="scss" scoped>
// [정상 대조군] 같은 크기로 그리지만 object-fit: cover 라 비율을 지키며 박스를 채운다. 왜곡으로 탐지되면 오탐이다
.thumb {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    width: 100%;
    height: 96px;
    object-fit: cover;
  }

  &__caption {
    margin-top: 8px;
    font-size: 14px;
  }
}
</style>
