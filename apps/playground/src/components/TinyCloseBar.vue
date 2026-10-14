<template>
  <aside class="bar" aria-label="알림 바">
    <p class="bar__text">새 쿠폰이 도착했어요</p>
    <button class="bar__action" type="button">확인</button>
    <button class="bar__close" type="button" aria-label="알림 닫기">×</button>
  </aside>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 닫기 버튼이 18px 로 작고 바로 옆 확인 버튼과 2px 만 떨어져 있어 잘못 누르기 쉽다. 768px 이상에서는 44px 로 정상이다
.bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 12px;

  &__text {
    flex: 1;
    margin: 0;
    font-size: 14px;
  }

  &__action {
    min-width: 48px;
    height: 36px;
    font-size: 14px;
  }

  &__close {
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 14px;
    line-height: 1;

    @media (min-width: 768px) {
      width: 44px;
      height: 44px;
    }
  }
}
</style>
