<template>
  <section class="filter">
    <h2 class="filter__heading">필터</h2>
    <article class="filter__card">
      <button type="button" class="filter__trigger" aria-haspopup="listbox" aria-expanded="true">정렬: 인기순</button>
      <ul class="filter__menu" role="listbox" aria-label="정렬 기준">
        <li role="option" tabindex="0" aria-selected="true">인기순</li>
        <li role="option" tabindex="0" aria-selected="false">최신순</li>
        <li role="option" tabindex="0" aria-selected="false">낮은 가격순</li>
      </ul>
    </article>
    <aside class="filter__bar" aria-label="적용된 필터">
      <p class="filter__result">검색 결과 128건</p>
    </aside>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함] 열린 드롭다운이 transform 이 걸린 카드의 stacking context 에 갇혀, z-index: 9999 여도 아래 막대(z-index: 20)에 가려진다.
// 768px 이상에서는 막대를 아래로 내려 겹치지 않게 한다
.filter {
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

  &__menu {
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
