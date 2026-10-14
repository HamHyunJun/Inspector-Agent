<template>
  <footer class="site-footer">
    <p class="site-footer__text">© 2026 Inspector-Agent Playground</p>
  </footer>
</template>

<style lang="scss" scoped>
// [결함 정답] 본문이 화면을 넘쳐 페이지가 가로 스크롤되면, 뷰포트 너비로만 그려진 이 푸터의 배경과 우측 여백이 스크롤한 만큼 끊긴다
.site-footer {
  padding: 16px;
  background: #24292f;
  color: #fff;

  &__text {
    margin: 0;
    font-size: 12px;
  }
}
</style>
