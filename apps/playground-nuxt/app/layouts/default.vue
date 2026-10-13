<template>
  <div class="layout">
    <header class="layout__header">
      <h1 class="layout__title">Nuxt Playground</h1>
    </header>
    <main class="layout__main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.layout {
  &__title {
    margin: 0;
    font-size: 20px;
  }
}
</style>
