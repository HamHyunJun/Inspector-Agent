<template>
  <section class="rtl-box" aria-label="물리 margin 상자">
    <p class="rtl-box__text">margin-right 를 쓴 상자</p>
  </section>
</template>

<style lang="scss" scoped>
// [환경 정답: RTL] 너비 100% 에 physical margin-right 를 줬다. 왼쪽→오른쪽 문서에서는 과한 제약이라 margin-right 가 무시되지만,
// 오른쪽→왼쪽 문서에서는 반대쪽 margin 이 무시되어 상자가 60px 왼쪽 밖으로 밀려난다(논리 속성 margin-inline-end 를 써야 한다)
.rtl-box {
  width: 100%;
  margin-right: 60px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  box-sizing: border-box;

  &__text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
