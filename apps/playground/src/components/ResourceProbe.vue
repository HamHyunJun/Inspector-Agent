<template>
  <!-- 좁은 화면에서만 존재하지 않는 스타일시트를 불러온다 -->
  <link v-if="isNarrow" rel="stylesheet" href="/styles/playground-missing-theme.css" />
</template>

<script setup lang="ts">
const isNarrow: boolean = window.matchMedia('(max-width: 480px)').matches
</script>
