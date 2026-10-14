<template>
  <nav class="tools" aria-label="도구 모음 대조군">
    <button class="tools__icon" type="button" aria-label="좋아요">♥</button>
    <button class="tools__icon" type="button" aria-label="공유">↗</button>
  </nav>
</template>

<style lang="scss" scoped>
// [정상 대조군] 아이콘 버튼이 20px 로 작지만 서로 40px 떨어져 있어 WCAG 2.5.8 간격 예외로 통과한다. 터치 타겟으로 탐지되면 오탐이다
.tools {
  display: flex;
  gap: 40px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__icon {
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 12px;
    line-height: 1;
  }
}
</style>
