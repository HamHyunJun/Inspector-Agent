<template>
  <p class="pill-row">
    <span class="pill">배송중</span>
  </p>
</template>

<style lang="scss" scoped>
// [환경 정답: 글자 크기 200%] 기본 크기에서는 56px 칩 안에 글자가 다 들어가지만, 글자만 2배로 키우면 overflow: hidden 에 잘려 말줄임 없이 사라진다
.pill-row {
  margin: 0;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
}

.pill {
  display: inline-block;
  width: 56px;
  height: 24px;
  overflow: hidden;
  background: #ddf4ff;
  border-radius: 12px;
  font-size: 12px;
  line-height: 24px;
  text-align: center;
  white-space: nowrap;
}
</style>
