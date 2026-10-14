<template>
  <figure class="hero">
    <picture>
      <!-- 좁은 화면용 소스 경로가 잘못되어 로드에 실패한다 -->
      <source media="(max-width: 480px)" :srcset="mobileSrc" />
      <img class="hero__img" src="../assets/thumb.png" alt="가을 시즌 기획전 배너" width="160" height="90" />
    </picture>
    <figcaption class="hero__caption">가을 시즌 기획전</figcaption>
  </figure>
</template>

<script setup lang="ts">
// 빌드 시점에 경로가 해석되지 않도록 변수로 바인딩한다(없는 파일이라 로드에 실패해야 한다)
const mobileSrc: string = '/images/hero-mobile.webp'
</script>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 <picture> 가 고른 모바일 소스(/images/hero-mobile.webp)가 없어 빈 사각형만 보인다 (레이아웃은 멀쩡하다). 768px 이상에서는 기본 이미지라 정상이다
.hero {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__img {
    display: block;
    max-width: 100%;
    height: auto;
  }

  &__caption {
    margin-top: 8px;
    font-size: 14px;
  }
}
</style>
