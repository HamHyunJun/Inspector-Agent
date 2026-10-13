<template>
  <section class="open-menu">
    <h2 class="open-menu__heading">클릭해야 열리는 메뉴</h2>
    <article class="open-menu__card">
      <button type="button" class="open-menu__trigger" aria-haspopup="listbox" :aria-expanded="isOpen" @click="toggle">
        {{ isOpen ? '닫기' : '정렬 열기' }}
      </button>
      <ul v-if="isOpen" class="open-menu__list" role="listbox" aria-label="정렬 기준">
        <li role="option" tabindex="0" aria-selected="true">인기순</li>
        <li role="option" tabindex="0" aria-selected="false">최신순</li>
        <li role="option" tabindex="0" aria-selected="false">낮은 가격순</li>
      </ul>
    </article>
    <aside class="open-menu__bar" aria-label="적용된 필터">
      <p class="open-menu__result">검색 결과 128건</p>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref<boolean>(false)

const toggle = (): void => {
  isOpen.value = !isOpen.value
}
</script>

<style lang="scss" scoped>
// [시나리오 전용 정답 결함] 기본 상태(닫힘)에서는 결함이 없다. 트리거를 클릭해 메뉴를 연 상태로 스캔해야만
// transform 카드의 stacking context 에 갇힌 메뉴(z-index: 9999)가 아래 막대(z-index: 20)에 가려지는 것이 보인다.
// 768px 이상에서는 막대를 아래로 내려 겹치지 않게 한다
.open-menu {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__card {
    position: relative;
    padding: 4px 12px;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    transform: translateY(0);
  }

  &__trigger {
    width: 100%;
    padding: 8px 0;
    border: 0;
    background: none;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  &__list {
    position: absolute;
    top: 100%;
    right: 0;
    left: 0;
    z-index: 9999;
    margin: 4px 0 0;
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

  &__bar {
    position: relative;
    z-index: 20;
    min-height: 160px;
    margin-top: 8px;
    padding: 12px;
    border-radius: 8px;
    background: #f6f8fa;

    @media (min-width: 768px) {
      margin-top: 140px;
    }
  }

  &__result {
    margin: 0;
    font-size: 14px;
  }
}
</style>
