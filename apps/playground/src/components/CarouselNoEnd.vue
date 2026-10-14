<template>
  <ul class="rail" aria-label="추천 상품">
    <li v-for="name in names" :key="name" class="rail__card">{{ name }}</li>
  </ul>
</template>

<script setup lang="ts">
const names: string[] = ['재킷', '베스트', '팬츠', '배낭', '모자']
</script>

<style lang="scss" scoped>
// [결함 정답] 가로 스크롤 목록 앞쪽에는 16px 여백이 있는데 끝에는 없어 마지막 카드가 오른쪽 가장자리에 붙는다. 768px 이상에서는 숨긴다
.rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;

  @media (min-width: 768px) {
    display: none;
  }

  &__card {
    flex: 0 0 120px;
    padding: 12px;
    background: #fff;
    border-radius: 12px;
    font-size: 14px;
  }
}
</style>
