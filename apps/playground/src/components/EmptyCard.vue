<template>
  <section class="empty-card" aria-labelledby="empty-card-title">
    <h2 id="empty-card-title" class="empty-card__title">최근 본 상품</h2>
    <p class="empty-card__text">아직 본 상품이 없습니다</p>
  </section>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 높이를 240px 로 고정해 내용 아래에 큰 빈 공간이 남는다. 768px 이상에서는 높이가 내용에 맞는다
.empty-card {
  height: 240px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  @media (min-width: 768px) {
    height: auto;
  }

  &__title {
    margin: 0 0 4px;
    font-size: 16px;
  }

  &__text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
