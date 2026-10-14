<template>
  <p class="cramped">줄 높이를 글자보다 작게 줘서 여러 줄로 줄바꿈된 문단의 윗줄과 아랫줄이 서로 붙어 읽기 어렵습니다 줄 높이는 본문 기준 1.4 이상을 쓰세요</p>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 줄 높이가 0.8 이라 줄이 붙는다. 768px 이상에서는 1.5 로 정상이다
.cramped {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;
  line-height: 0.8;

  @media (min-width: 768px) {
    line-height: 1.5;
  }
}
</style>
