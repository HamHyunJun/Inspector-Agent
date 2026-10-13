<template>
  <section class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title">
    <h2 id="share-sheet-title" class="share-sheet__title">공유하기</h2>
    <button type="button" class="share-sheet__button">링크 복사</button>
    <button type="button" class="share-sheet__button">메시지로 보내기</button>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함] aria-modal 만 선언하고 포커스를 가두지 않아, 마지막 버튼에서 Tab 을 누르면 모달 밖으로 나간다.
// 모바일 바텀시트라 768px 이상에서는 보이지 않는다
.share-sheet {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  @media (min-width: 768px) {
    display: none;
  }

  &__title {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__button {
    margin-right: 8px;
    padding: 6px 12px;
    cursor: pointer;
  }
}
</style>
