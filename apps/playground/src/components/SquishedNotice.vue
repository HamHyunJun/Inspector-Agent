<template>
  <aside class="notice" aria-label="저장 안내">
    <span class="notice__icon" aria-hidden="true" />
    <p class="notice__text">저장하지 않은 변경 사항이 있습니다 나가기 전에 꼭 확인해 주세요</p>
  </aside>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 문구가 줄바꿈되며 줄이 좁아지면, 줄어들지 않게 막지 않은 원형 아이콘이 가로로만 줄어 타원이 된다 (넘침도 잘림도 없다)
.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__icon {
    width: 24px;
    height: 24px;
    background: #8250df;
    border-radius: 50%;
  }

  &__text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
