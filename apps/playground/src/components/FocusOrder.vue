<template>
  <ul class="order" aria-label="순서 바뀐 버튼">
    <li class="order__item"><button class="order__button" type="button">첫째 (DOM)</button></li>
    <li class="order__item"><button class="order__button" type="button">둘째 (DOM)</button></li>
    <li class="order__item order__item--top"><button class="order__button" type="button">셋째 (화면 맨 위)</button></li>
  </ul>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 CSS order 로 셋째를 화면 맨 위로 올려 Tab 이 둘째에서 위쪽으로 되돌아간다. 768px 이상에서는 순서를 바꾸지 않는다
.order {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 12px;
  list-style: none;
  background: #fff;
  border-radius: 12px;

  &__item {
    display: flex;
    align-items: center;
    height: 120px;

    &--top {
      order: -1;

      @media (min-width: 768px) {
        order: 0;
      }
    }
  }

  &__button {
    height: 44px;
    min-width: 120px;
  }
}
</style>
