<template>
  <section class="confirm">
    <h2 class="confirm__heading">확인 창</h2>
    <div class="confirm__stage">
      <header class="confirm__bar">
        <p class="confirm__bar-title">주문 진행 상황</p>
      </header>
      <div class="confirm__panel" role="dialog" aria-labelledby="confirm-title">
        <h3 id="confirm-title" class="confirm__title">주문을 취소할까요?</h3>
        <button type="button" class="confirm__button">취소하기</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함] 같은 stacking context 안에서 패널(z-index: 5)이 위쪽 막대(z-index: 100)에 가려진다.
// 768px 이상에서는 패널을 막대 아래로 내려 겹치지 않게 한다
.confirm {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__stage {
    position: relative;
    min-height: 300px;
  }

  &__bar {
    position: relative;
    z-index: 100;
    min-height: 180px;
    padding: 12px;
    border-radius: 8px;
    background: #f6f8fa;
  }

  &__bar-title {
    margin: 0;
    font-size: 14px;
  }

  &__panel {
    position: absolute;
    top: 16px;
    right: 16px;
    left: 16px;
    z-index: 5;
    padding: 12px;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: #fff;

    @media (min-width: 768px) {
      top: 192px;
    }
  }

  &__title {
    margin: 0 0 8px;
    font-size: 15px;
  }

  &__button {
    padding: 6px 12px;
    cursor: pointer;
  }
}
</style>
