<template>
  <section class="tag-section" aria-labelledby="tag-heading">
    <h2 id="tag-heading" class="tag-section__heading">태그</h2>
    <ul class="tag-list">
      <li v-for="tag in tags" :key="tag" class="tag-list__item">
        <span>#{{ tag }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  tags: string[]
}>()
</script>

<style lang="scss" scoped>
// [심어 둔 결함] 줄바꿈 없는 flex 컨테이너 + 줄어들지 않는 태그
.tag-section {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }
}

.tag-list {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  &__item {
    flex-shrink: 0;
    padding: 4px 12px;
    font-size: 14px;
    background: #ddf4ff;
    border-radius: 999px;
  }
}
</style>
