<template>
  <form class="faint-field" @submit.prevent>
    <label class="faint-field__label" for="faint-field-email">이메일</label>
    <input id="faint-field-email" class="faint-field__input" type="email" />
  </form>
</template>

<style lang="scss" scoped>
// [결함 정답] 입력창 테두리(#e5e7eb)가 흰 배경과 대비 약 1.2:1 이라 칸이 어디인지 잘 안 보인다. 768px 이상에서는 숨긴다
.faint-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  @media (min-width: 768px) {
    display: none;
  }

  &__label {
    font-size: 14px;
  }

  &__input {
    box-sizing: border-box;
    height: 40px;
    border: 1px solid #e5e7eb;
    background: #fff;
    font-size: 16px;
  }
}
</style>
