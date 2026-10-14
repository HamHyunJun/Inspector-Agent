<template>
  <p class="lone-note">Short words fill the row up</p>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 칸이 24ch 라 마지막 줄에 "up" 한 단어만 홀로 남는다(고정폭 글꼴이라 줄바꿈이 환경과 무관하다). 768px 이상에서는 한 줄이다
.lone-note {
  width: 24ch;
  margin: 0;
  padding: 12px;
  box-sizing: content-box;
  background: #fff;
  border-radius: 12px;
  font: 14px monospace;

  @media (min-width: 768px) {
    width: auto;
  }
}
</style>
