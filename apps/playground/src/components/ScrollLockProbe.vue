<template>
  <span class="scroll-lock-probe" hidden />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

// [시나리오 전용 정답] localStorage 시드(ia-demo-scroll-lock=1)가 있으면 모달 없이 body 스크롤을 잠가 둔다(닫을 때 잠금을 풀지 않은 모달 재현)
onMounted((): void => {
  if (window.localStorage.getItem('ia-demo-scroll-lock') === '1') document.body.style.overflowY = 'hidden'
})

onBeforeUnmount((): void => {
  document.body.style.overflowY = ''
})
</script>
