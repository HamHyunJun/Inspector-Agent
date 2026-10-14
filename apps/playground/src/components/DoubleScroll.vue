<template>
  <section class="pane" aria-label="약관" tabindex="0">
    <p v-for="line in lines" :key="line" class="pane__line">{{ line }}</p>
  </section>
</template>

<script setup lang="ts">
const lines: string[] = Array.from({ length: 30 }, (_, index): string => `제 ${index + 1} 조 약관 내용이 이어집니다`)
</script>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 화면 높이의 70% 영역이 페이지와 따로 스크롤되어 이중 스크롤바가 생긴다. 768px 이상에서는 높이 제한 없이 페이지 스크롤만 쓴다
.pane {
  height: 70vh;
  overflow-y: auto;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  @media (min-width: 768px) {
    height: auto;
    overflow: visible;
  }

  &__line {
    margin: 0 0 8px;
  }
}
</style>
