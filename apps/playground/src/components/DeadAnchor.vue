<template>
  <nav class="toc" aria-label="페이지 안 이동">
    <a class="toc__link" href="#reviews">리뷰 보기</a>
  </nav>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서만 보이는 목차 링크의 대상 #reviews 가 문서에 없어 눌러도 이동하지 않는다. 768px 이상에서는 숨긴다
.toc {
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
