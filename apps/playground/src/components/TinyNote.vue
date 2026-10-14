<template>
  <p class="tiny">배송은 영업일 기준 2~3일 소요됩니다</p>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 안내 문구가 10px 라 읽기 어렵다. 768px 이상에서는 14px 로 정상이다
.tiny {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 10px;

  @media (min-width: 768px) {
    font-size: 14px;
  }
}
</style>
