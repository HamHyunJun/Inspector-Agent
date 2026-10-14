<template>
  <p class="dark-card">다크 모드에서 배경만 어두워지고 글자색은 그대로인 카드입니다</p>
</template>

<style lang="scss" scoped>
// [환경 정답: 다크 모드] 다크 모드 배경만 어둡게 바꾸고 글자색은 안 바꿔 어두운 배경 위 어두운 글자가 된다(대비 약 1.1:1)
.dark-card {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  color: #24292f;
  font-size: 14px;

  @media (prefers-color-scheme: dark) {
    background: #1f2328;
  }
}
</style>
