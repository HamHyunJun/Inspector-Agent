<template>
  <span class="console-probe" hidden />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

// [결함 정답] 좁은 화면에서만 렌더 중 콘솔 에러가 난다(탐지기는 verifier 가 심은 수집 스크립트로 읽는다)
onMounted((): void => {
  if (window.matchMedia('(max-width: 480px)').matches) console.error('Playground: 좁은 화면 렌더 중 에러')
})
</script>
