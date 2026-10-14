<template>
  <aside v-if="shown" class="shift-banner" aria-label="프로모션">
    <p class="shift-banner__text">늦게 뜨는 프로모션 배너</p>
  </aside>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const shown = ref<boolean>(false)

// [결함 정답] 좁은 화면에서 로드 150ms 뒤에 맨 위에 배너가 끼어들어 아래 내용이 한꺼번에 밀린다(레이아웃 이동)
onMounted((): void => {
  if (window.matchMedia('(max-width: 480px)').matches) window.setTimeout((): void => void (shown.value = true), 150)
})
</script>

<style lang="scss" scoped>
.shift-banner {
  display: flex;
  align-items: center;
  height: 200px;
  padding: 12px;
  background: #ddf4ff;
  border-radius: 12px;
  font-size: 14px;

  &__text {
    margin: 0;
  }
}
</style>
