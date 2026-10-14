<template>
  <dl class="order-line">
    <dt class="order-line__label">주문내역</dt>
    <dd class="order-line__value">트레킹 재킷 외 1건</dd>
  </dl>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 라벨 칸을 18px 로 고정해 "주문내역" 이 주/문/내/역 네 줄로 세로로 선다 (넘침도 잘림도 없다). 768px 이상에서는 자동 폭이라 정상이다
.order-line {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  &__label {
    flex-shrink: 0;
    width: 18px;
    font-weight: 700;

    @media (min-width: 768px) {
      width: auto;
    }
  }

  &__value {
    margin: 0;
  }
}
</style>
