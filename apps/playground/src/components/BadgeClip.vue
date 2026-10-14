<template>
  <article class="clip-card">
    <span class="clip-card__badge">NEW</span>
    <p class="clip-card__name">신상 트레킹 재킷</p>
  </article>
</template>

<style lang="scss" scoped>
// [결함 정답] 카드의 overflow: hidden 이 모서리 밖으로 6px 걸친 NEW 배지를 반쯤 잘라 먹는다. 768px 이상에서는 숨긴다
.clip-card {
  position: relative;
  overflow: hidden;
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  @media (min-width: 768px) {
    display: none;
  }

  &__badge {
    position: absolute;
    top: -6px;
    right: -6px;
    padding: 4px 8px;
    background: #cf222e;
    border-radius: 12px;
    color: #fff;
    font-size: 12px;
  }

  &__name {
    margin: 0;
    font-size: 14px;
  }
}
</style>
