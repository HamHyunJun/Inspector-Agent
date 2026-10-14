<template>
  <p class="faint">배송 정보는 결제 후 문자로 안내해 드립니다</p>
</template>

<style lang="scss" scoped>
// [결함 정답] 흰 카드 위 연한 회색(#b0b8c1) 글자는 대비가 약 2:1 이라 읽기 어렵다. 768px 이상에서는 숨긴다
.faint {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  color: #b0b8c1;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
