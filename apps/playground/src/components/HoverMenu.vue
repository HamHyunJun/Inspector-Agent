<template>
  <nav class="hover-nav" aria-label="카테고리 메뉴">
    <p class="hover-nav__label">카테고리</p>
    <ul class="hover-nav__menu">
      <li><a class="hover-nav__link" href="/tops">상의</a></li>
      <li><a class="hover-nav__link" href="/bottoms">하의</a></li>
    </ul>
  </nav>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 하위 메뉴가 :hover 로만 열려 키보드(Tab)와 터치로는 열 수 없다. 768px 이상에서는 숨긴다
.hover-nav {
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  @media (min-width: 768px) {
    display: none;
  }

  &__label {
    margin: 0;
  }

  &__menu {
    display: none;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  &:hover &__menu {
    display: block;
  }

  &__link {
    display: inline-block;
    min-height: 32px;
    min-width: 48px;
  }
}
</style>
