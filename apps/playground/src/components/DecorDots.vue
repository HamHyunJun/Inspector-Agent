<template>
  <section class="decor-dots">
    <h2 class="decor-dots__heading">장식 점</h2>
    <figure class="decor-dots__stage" aria-hidden="true">
      <span v-for="n in 25" :key="n" class="decor-dots__dot" :style="{ left: `${n * 10}px` }"></span>
      <span class="decor-dots__veil"></span>
    </figure>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정상 대조군] 팝업이 아닌 4px 장식 점 25개가 위에 덮개(z-index: 10)로 가려져 있다. 가려짐으로 탐지되면 오탐이다.
// 이 컴포넌트는 문서 맨 앞에 있어, 후보 상한이 앞쪽 장식으로 소진되면 뒤쪽 정답 팝업을 놓치는 회귀도 함께 잡는다
.decor-dots {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__stage {
    position: relative;
    height: 24px;
    margin: 0;
  }

  &__dot {
    position: absolute;
    top: 10px;
    z-index: 1;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #cf222e;
  }

  &__veil {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: rgba(255, 255, 255, 0.6);
  }
}
</style>
