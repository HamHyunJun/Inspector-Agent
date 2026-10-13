<template>
  <section class="share-link">
    <h2 class="share-link__heading">공유 링크</h2>
    <p class="share-link__url">{{ url }}</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  url: string
}>()
</script>

<style lang="scss" scoped>
// [심어 둔 결함] 공백 없는 긴 URL
.share-link {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__url {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: #0969da;
  }
}
</style>
