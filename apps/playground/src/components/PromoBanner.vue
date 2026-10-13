<template>
  <section class="promo-banner">
    <aside class="promo-banner__box">
      <p class="promo-banner__text">가을 시즌 오프 최대 40% 할인</p>
    </aside>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [심어 둔 결함] 데스크톱 기준 고정 너비
.promo-banner {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__box {
    width: 420px;
    padding: 16px;
    color: #fff;
    background: #8250df;
    border-radius: 8px;
  }

  &__text {
    margin: 0;
    font-weight: 700;
  }
}
</style>
