<template>
  <div class="fake-buy" @click="count++">장바구니 담기 {{ count }}</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const count = ref<number>(0)
</script>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 div 에 클릭만 걸어 버튼처럼 보이지만 Tab 으로 포커스할 수 없고 스크린 리더도 버튼으로 읽지 않는다. 768px 이상에서는 숨긴다
.fake-buy {
  padding: 12px;
  background: #0969da;
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
