<template>
  <article class="card-item">
    <h3 class="card-item__title">{{ title }}</h3>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style lang="scss" scoped>
.card-item {
  padding: 12px;
}
</style>
