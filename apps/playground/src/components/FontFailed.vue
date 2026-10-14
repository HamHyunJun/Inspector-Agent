<template>
  <p class="font-card">경로가 틀린 웹폰트로 그려야 하는 문구입니다</p>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서만 보이는 문구가 쓰는 웹폰트 파일이 없어 로드에 실패하고 대체 글꼴로 보인다(보이지 않는 곳에서는 폰트를 내려받지 않는다). 768px 이상에서는 숨긴다
@font-face {
  font-family: 'Playground Missing Sans';
  src: url('/fonts/playground-missing-sans.woff2') format('woff2');
}

.font-card {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-family: 'Playground Missing Sans', sans-serif;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }
}
</style>
