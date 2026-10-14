<template>
  <dl class="wrap-line">
    <dt class="wrap-line__label">배송안내문구확인</dt>
    <dd class="wrap-line__value">영업일 기준 2~3일 소요됩니다</dd>
  </dl>
</template>

<style lang="scss" scoped>
// [정상 대조군] 라벨 칸이 좁아 두 줄로 줄바꿈되지만 한 줄에 4글자씩 보여 읽을 수 있다. 세로 쪼개짐으로 탐지되면 오탐이다
.wrap-line {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  &__label {
    flex-shrink: 0;
    width: 64px;
    font-weight: 700;
  }

  &__value {
    margin: 0;
  }
}
</style>
