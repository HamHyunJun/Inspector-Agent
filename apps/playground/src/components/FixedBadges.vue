<template>
  <nav class="fabs" aria-label="바로가기">
    <button class="fabs__chat" type="button">상담</button>
    <button class="fabs__top" type="button">맨 위로</button>
  </nav>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 화면에 고정된 두 떠 있는 버튼이 겹친다(두 버튼의 중심은 서로 가리지 않는다). 768px 이상에서는 숨긴다
.fabs {
  @media (min-width: 768px) {
    display: none;
  }

  &__chat,
  &__top {
    position: fixed;
    top: 96px;
    right: 60px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    font-size: 12px;
  }

  &__top {
    right: 28px;
  }
}
</style>
