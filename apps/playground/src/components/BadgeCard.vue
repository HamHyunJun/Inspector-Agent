<template>
  <article class="badge-card">
    <h2 class="badge-card__title">신상품</h2>
    <p class="badge-card__desc">카드 모서리에 겹쳐 올라온 배지와 장식 요소</p>
    <small class="badge-card__hint" aria-hidden="true">장식 힌트</small>
    <span class="badge-card__badge">NEW</span>
  </article>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정상 대조군] 의도된 겹침. 배지는 맨 위에 있고 장식 힌트는 pointer-events:none 이다. 탐지되면 오탐이다
.badge-card {
  position: relative;
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__title {
    margin: 0;
    font-size: 16px;
  }

  &__desc {
    margin: 8px 0 0;
    font-size: 14px;
  }

  &__hint {
    position: absolute;
    right: 16px;
    bottom: 8px;
    z-index: 3;
    pointer-events: none;
    color: #57606a;
  }

  &__badge {
    position: absolute;
    top: -8px;
    right: 12px;
    z-index: 2;
    padding: 2px 8px;
    border-radius: 999px;
    background: #cf222e;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }
}
</style>
