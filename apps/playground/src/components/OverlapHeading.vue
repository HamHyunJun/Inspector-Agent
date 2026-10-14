<template>
  <section class="overlap" aria-labelledby="overlap-title">
    <h2 id="overlap-title" class="overlap__title">이번 주 인기 상품</h2>
    <p class="overlap__desc">제목을 위로 끌어올리려고 준 음수 margin 때문에 아래 설명 글자를 덮습니다.</p>
  </section>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 설명 문단이 음수 margin 으로 위로 끌려 올라가 제목 글자 위에 얹힌다 (넘침도 잘림도 없다). 768px 이상에서는 정상이다
.overlap {
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__title {
    margin: 0;
    font-size: 18px;
    line-height: 1.2;
  }

  &__desc {
    margin: -12px 0 0;
    font-size: 14px;
    line-height: 1.4;

    @media (min-width: 768px) {
      margin-top: 4px;
    }
  }
}
</style>
