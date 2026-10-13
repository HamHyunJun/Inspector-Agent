<template>
  <section class="height-controls">
    <h2 class="height-controls__heading">높이 대조군</h2>

    <p class="height-controls__scroll" tabindex="0" aria-label="스크롤되는 설명">
      고정 높이 72px 안에서 스크롤되는 영역입니다. 줄바꿈된 글이 길어도 의도된 스크롤이므로 넘침이 아닙니다. 첫째 줄입니다. 둘째 줄입니다. 셋째 줄입니다. 넷째 줄입니다. 다섯째 줄입니다. 여섯째 줄입니다.
    </p>

    <p class="height-controls__anchor">
      고정 높이 앵커
      <span class="height-controls__tip">절대 위치 툴팁은 컨테이너 아래로 나와도 정상</span>
    </p>

    <div class="height-controls__floats">
      <span class="height-controls__float">float</span>
    </div>

    <p class="height-controls__clamp">두 줄까지만 보여 주고 나머지는 말줄임으로 감추는 line-clamp 입니다. 의도된 잘림이므로 결함이 아닙니다. 이 문장은 일부러 길게 써서 세 줄 이상이 되게 합니다.</p>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정상 대조군] 의도된 스크롤, 절대 위치 툴팁, float, line-clamp 는 세로 오버플로우로 탐지되면 오탐이다
.height-controls {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__scroll {
    height: 72px;
    margin: 0 0 12px;
    overflow-y: auto;
    font-size: 14px;
  }

  &__anchor {
    position: relative;
    height: 24px;
    margin: 0 0 40px;
    font-size: 14px;
  }

  &__tip {
    position: absolute;
    top: 100%;
    left: 0;
    padding: 2px 6px;
    background: #f6f8fa;
    border-radius: 4px;
    font-size: 12px;
  }

  &__floats {
    height: 0;
    margin-bottom: 28px;
  }

  &__float {
    float: left;
    width: 48px;
    height: 24px;
    background: #ddf4ff;
    font-size: 12px;
    text-align: center;
  }

  &__clamp {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
</style>
