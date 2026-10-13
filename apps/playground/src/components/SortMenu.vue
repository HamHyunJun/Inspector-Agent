<template>
  <section class="sort-menu">
    <h2 class="sort-menu__heading">정렬</h2>
    <button type="button" class="sort-menu__trigger" aria-haspopup="listbox" :aria-expanded="false">
      <span>최신순</span>
      <span class="sort-menu__chevron" aria-hidden="true">›</span>
    </button>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정상 대조군] transform: rotate 로 회전한 아이콘. 레이아웃 박스는 부모 안에 있으므로 탐지되면 오탐이다
.sort-menu {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font-size: 14px;
    cursor: pointer;
  }

  &__chevron {
    font-size: 24px;
    line-height: 1;
    transform: rotate(90deg);
    transition: transform 0.15s;
  }
}
</style>
