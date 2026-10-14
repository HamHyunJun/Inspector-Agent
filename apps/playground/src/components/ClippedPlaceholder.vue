<template>
  <form class="clipped-field" @submit.prevent>
    <label class="clipped-field__label" for="clipped-field-name">받는 분</label>
    <input id="clipped-field-name" class="clipped-field__input" type="text" placeholder="이름을 입력해 주세요 (실명)" />
  </form>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 입력창이 100px 라 placeholder 끝이 잘린다. 768px 이상에서는 280px 로 다 보인다
.clipped-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__label {
    font-size: 14px;
  }

  &__input {
    box-sizing: border-box;
    width: 100px;
    height: 40px;
    font-size: 16px;

    @media (min-width: 768px) {
      width: 280px;
    }
  }
}
</style>
