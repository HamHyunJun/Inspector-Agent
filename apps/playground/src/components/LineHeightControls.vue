<template>
  <section class="tight" aria-label="촘촘한 줄 간격 대조군">
    <p class="tight__line">첫 번째 줄은 줄 높이가 1 이라 글꼴 상자가 아래 줄과 조금 닿습니다</p>
    <p class="tight__line">두 번째 줄도 마찬가지로 줄 높이가 1 이지만 글자는 겹치지 않습니다</p>
  </section>
</template>

<style lang="scss" scoped>
// [정상 대조군] 줄 높이 1 로 붙여 쌓은 문단. 글꼴 상자가 서로 2px 남짓 닿는 것은 정상이라 겹침으로 탐지되면 오탐이다
.tight {
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__line {
    margin: 0;
    font-size: 14px;
    line-height: 1;
  }
}
</style>
