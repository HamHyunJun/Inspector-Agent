<template>
  <section class="modal-control">
    <h2 class="modal-control__heading">모달 대조군</h2>
    <div class="modal-control__stage">
      <ul class="modal-control__menu" role="menu" aria-label="모달 아래 메뉴">
        <li role="menuitem" tabindex="-1">메뉴 항목 1</li>
        <li role="menuitem" tabindex="-1">메뉴 항목 2</li>
      </ul>
      <dialog class="modal-control__dialog" open aria-modal="true" aria-labelledby="modal-control-title" @keydown.tab="trapFocus">
        <h3 id="modal-control-title" class="modal-control__title">저장할까요?</h3>
        <button type="button" class="modal-control__button">확인</button>
      </dialog>
    </div>
  </section>
</template>

<script setup lang="ts">
// 마지막 요소에서 Tab 은 첫 요소로, 첫 요소에서 Shift+Tab 은 마지막 요소로 돌려 포커스를 모달 안에 가둔다
const trapFocus = (event: KeyboardEvent): void => {
  const focusable = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button, [href], input, select, textarea')
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<style lang="scss" scoped>
// [정상 대조군] 모달이 아래 요소를 덮는 것은 정상이고(가려짐 오탐 점검), keydown 핸들러로 포커스를 가두고 있다(포커스 이탈 오탐 점검). 탐지되면 오탐이다
.modal-control {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__stage {
    position: relative;
    height: 120px;
  }

  &__menu {
    position: absolute;
    inset: 8px;
    z-index: 1;
    margin: 0;
    padding: 8px;
    list-style: none;
    background: #f6f8fa;
    font-size: 14px;
  }

  &__dialog {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: auto;
    height: auto;
    margin: 0;
    padding: 12px;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: #fff;
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
