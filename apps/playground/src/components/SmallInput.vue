<template>
  <form class="small-input" @submit.prevent>
    <label class="small-input__label" for="small-input-field">상품 검색</label>
    <input id="small-input-field" class="small-input__field" type="search" placeholder="검색어" />
  </form>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 입력창 글자가 14px 라 iOS 에서 누르면 화면이 확대된다. 768px 이상에서는 16px 로 정상이다
.small-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__label {
    font-size: 14px;
  }

  &__field {
    box-sizing: border-box;
    height: 40px;
    font-size: 14px;

    @media (min-width: 768px) {
      font-size: 16px;
    }
  }
}
</style>
