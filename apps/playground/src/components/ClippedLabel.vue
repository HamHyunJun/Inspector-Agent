<template>
  <section class="clipped-label">
    <h2 class="clipped-label__heading">잘리는 라벨</h2>
    <p class="clipped-label__tag">Ultralight-Backpacking-Titanium-Cookset 2026 에디션</p>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함: 텍스트 잘림] overflow: hidden + white-space: nowrap 인데 text-overflow: ellipsis 가 없어 글자가 잘렸다는 표시 없이 사라진다.
// 768px 이상에서는 너비가 넉넉해 모두 보인다
.clipped-label {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__tag {
    box-sizing: border-box;
    width: 140px;
    margin: 0;
    padding: 4px 8px;
    overflow: hidden;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    font-size: 14px;
    white-space: nowrap;

    @media (min-width: 768px) {
      width: 480px;
    }
  }
}
</style>
