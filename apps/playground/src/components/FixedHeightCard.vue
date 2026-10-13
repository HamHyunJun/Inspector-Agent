<template>
  <section class="fixed-card">
    <h2 class="fixed-card__title">고정 높이 카드</h2>
    <p class="fixed-card__text">
      카드 높이를 64px 로 고정했지만 설명이 길어서 줄바꿈된 글이 카드 아래로 넘쳐 다음 요소와 겹칩니다. 높이는 콘텐츠에 맞게 늘어나거나 넘치는 부분을 스크롤로 보여 줘야 합니다.
    </p>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함: 세로 오버플로우] height 고정 + overflow: visible 이라 줄바꿈된 설명이 카드 밖으로 넘친다.
// 768px 이상에서는 높이가 콘텐츠에 맞게 늘어나 정상이다
.fixed-card {
  height: 64px;
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
    line-height: 1.5;
  }
}
</style>
