<template>
  <aside class="icon-controls" aria-label="저장 안내 대조군">
    <span class="icon-controls__icon" aria-hidden="true" />
    <p class="icon-controls__text">저장하지 않은 변경 사항이 있습니다 나가기 전에 꼭 확인해 주세요</p>
  </aside>
</template>

<style lang="scss" scoped>
// [정상 대조군] 같은 구조지만 아이콘이 flex-shrink: 0 이라 좁은 화면에서도 24×24 원형을 유지한다. 찌그러짐으로 탐지되면 오탐이다
.icon-controls {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    background: #2da44e;
    border-radius: 50%;
  }

  &__text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
