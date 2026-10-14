<template>
  <ul class="chips" aria-label="카테고리">
    <li v-for="name in names" :key="name" class="chips__item">{{ name }}</li>
  </ul>
</template>

<script setup lang="ts">
const names: string[] = ['상의', '하의', '신발', '가방']
</script>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 같은 크기 칩 4개가 3+1 로 줄바꿈되어 마지막 줄에 하나만 외톨이로 남는다. 768px 이상에서는 한 줄이다
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 12px;
  list-style: none;
  background: #fff;
  border-radius: 12px;

  &__item {
    flex: 0 0 calc((100% - 16px) / 3);
    padding: 8px 0;
    background: #eaeef2;
    border-radius: 8px;
    font-size: 14px;
    text-align: center;

    @media (min-width: 768px) {
      flex-basis: calc((100% - 24px) / 4);
    }
  }
}
</style>
