<template>
  <div class="status">
    <span class="status__icon" aria-hidden="true" />
    <span class="status__text">결제 완료</span>
  </div>
</template>

<style lang="scss" scoped>
// [결함 정답] 32px 아이콘이 위쪽에 붙어(flex-start) 한 줄 글자와 세로 중심이 7px 어긋난다. 768px 이상에서는 숨긴다
.status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }

  &__icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    background: #2da44e;
    border-radius: 50%;
  }
}
</style>
