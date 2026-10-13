<template>
  <section v-if="nickname" class="seeded-chip">
    <h2 class="seeded-chip__heading">내 닉네임</h2>
    <p class="seeded-chip__name">{{ nickname }}</p>
  </section>
</template>

<script setup lang="ts">
// localStorage 에 값이 있을 때만 그려지는 화면. 값이 없으면 아무것도 렌더링하지 않는다
const nickname = window.localStorage.getItem('ia-demo-nickname') ?? ''
</script>

<style lang="scss" scoped>
// [시나리오 전용 정답 결함] 시드(localStorage)가 없으면 렌더링되지 않는다. 시드로 공백 없는 긴 닉네임을 주면 줄바꿈되지 않아 넘친다
.seeded-chip {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__name {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
}
</style>
