<template>
  <section class="cta" aria-label="시작하기">
    <p class="cta__text">지금 시작해 보세요</p>
    <button class="cta__button" type="button">시작하기</button>
  </section>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 min-height: 100vh 라 모바일 주소창이 보이는 동안 아래쪽 시작 버튼이 화면 밖으로 밀린다. 768px 이상에서는 높이를 제한하지 않는다
.cta {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  @media (min-width: 768px) {
    min-height: auto;
  }

  &__text {
    margin: 0;
  }

  &__button {
    height: 44px;
  }
}
</style>
