<template>
  <header class="app-header">
    <NuxtLink to="/" class="app-header__brand">
      <span class="app-header__logo" aria-hidden="true">◎</span>
      <span>Inspector-Agent</span>
    </NuxtLink>
    <p class="app-header__tagline">런타임 레이아웃 결함 탐지 · 소스 매핑 · 측정 기반 자가 치유</p>
  </header>
  <main class="app-main">
    <NuxtPage />
  </main>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);

  &__brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
  }

  &__logo {
    color: var(--color-accent);
  }

  &__tagline {
    margin: 0;
    min-width: 0;
    color: var(--color-text-muted);
  }
}

.app-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}
</style>
