<template>
  <p class="status-row">
    <span class="status-chip">결제완료</span>
  </p>
</template>

<style lang="scss" scoped>
// [환경 정답: 긴 문구] 기본 문구는 76px 칩에 들어가지만, 번역처럼 문구가 1.5배 길어지면 줄바꿈 없는 글이 칩 밖으로 넘친다
.status-row {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
}

.status-chip {
  display: inline-block;
  width: 76px;
  background: #dafbe1;
  border-radius: 12px;
  font-size: 14px;
  text-align: center;
  white-space: nowrap;
}
</style>
