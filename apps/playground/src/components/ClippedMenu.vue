<template>
  <section class="clipped">
    <h2 class="clipped__heading">계정 메뉴</h2>
    <nav class="clipped__nav" aria-label="계정">
      <button type="button" class="clipped__trigger" aria-haspopup="menu" aria-expanded="true">내 계정</button>
      <ul class="clipped__menu" role="menu" aria-label="계정 메뉴">
        <li role="menuitem" tabindex="0">프로필</li>
        <li role="menuitem" tabindex="0">주문 내역</li>
        <li role="menuitem" tabindex="0">로그아웃</li>
      </ul>
    </nav>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함] overflow: hidden 인 nav 가 경계 밖으로 내려온 메뉴를 잘라낸다.
// 768px 이상에서는 overflow 를 풀어 메뉴가 보이게 하고, 메뉴가 내려올 자리를 아래에 비워 둔다
.clipped {
  padding: 16px;
  border-radius: 12px;
  background: #fff;

  @media (min-width: 768px) {
    padding-bottom: 150px;
  }

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__nav {
    position: relative;
    overflow: hidden;

    @media (min-width: 768px) {
      overflow: visible;
    }
  }

  &__trigger {
    padding: 8px 0;
    border: 0;
    background: none;
    font-size: 14px;
    cursor: pointer;
  }

  &__menu {
    position: absolute;
    top: 100%;
    left: 0;
    width: 160px;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: #fff;
    font-size: 14px;

    li {
      padding: 10px 12px;
    }
  }
}
</style>
