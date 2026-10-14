<template>
  <button class="lopsided" type="button">확인</button>
</template>

<style lang="scss" scoped>
// [결함 정답] 위·아래 padding 이 비대칭(2px / 16px)이라 버튼 안 글자가 위로 치우친다. 768px 이상에서는 숨긴다
.lopsided {
  align-self: flex-start;
  min-width: 96px;
  padding: 2px 16px 18px;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
