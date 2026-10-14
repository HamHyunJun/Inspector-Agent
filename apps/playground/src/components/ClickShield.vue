<template>
  <section class="shield">
    <button class="shield__buy" type="button">구매하기</button>
    <span class="shield__layer" />
  </section>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 투명 레이어가 버튼 위를 덮어 눌러도 반응하지 않는다(버튼은 멀쩡해 보인다). 768px 이상에서는 레이어를 숨긴다
.shield {
  position: relative;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__buy {
    min-width: 96px;
    height: 44px;
  }

  &__layer {
    position: absolute;
    inset: 0;

    @media (min-width: 768px) {
      display: none;
    }
  }
}
</style>
