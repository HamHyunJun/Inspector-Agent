<template>
  <section class="controls1" aria-label="묶음 1 정상 대조군">
    <p class="controls1__note">12px 글자는 작지만 기준(12px) 이상이라 정상입니다</p>
    <p class="controls1__body">Readable lines keep going and the last line stays long enough</p>
    <p class="controls1__mono">Short words fill the row of text ok</p>
    <label class="controls1__label" for="controls1-input">16px 입력창</label>
    <input id="controls1-input" class="controls1__input" type="text" placeholder="짧은 안내" />
    <a class="controls1__link" href="#controls1-target">같은 문서의 대상으로 이동</a>
    <span id="controls1-target" class="controls1__target">이동 대상</span>
    <ul class="controls1__chips" aria-label="길이가 다른 칩">
      <li v-for="chip in chips" :key="chip" class="controls1__chip">{{ chip }}</li>
    </ul>
    <ul class="controls1__pairs" aria-label="두 줄로 딱 맞는 칩">
      <li v-for="chip in pairs" :key="chip" class="controls1__pair">{{ chip }}</li>
    </ul>
    <div class="controls1__center">가운데 정렬된 빈 상태</div>
    <div class="controls1__static">z-index 가 static 이어도 아무것도 덮지 않음</div>
    <div class="controls1__sticky-wrap">
      <h2 class="controls1__sticky">overflow 가 없는 래퍼의 sticky 제목</h2>
      <p class="controls1__sticky-text">조상에 overflow 가 없어 정상적으로 붙습니다</p>
    </div>
  </section>
</template>

<script setup lang="ts">
const chips: string[] = ['상의', '아우터', '신발', '가방과 소품', '액세서리']
const pairs: string[] = ['A', 'B', 'C', 'D']
</script>

<style lang="scss" scoped>
// [정상 대조군] 묶음 1 규칙들이 정상 상태를 결함으로 잡지 않는지 확인한다. 이 파일에서 무엇이든 탐지되면 오탐이다
.controls1 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;

  &__note {
    margin: 0;
    font-size: 12px;
  }

  &__body {
    width: 30ch;
    margin: 0;
    font: 14px/1.4 monospace;
  }

  &__mono {
    width: 24ch;
    margin: 0;
    font: 14px monospace;
  }

  &__label,
  &__link,
  &__target {
    font-size: 14px;
  }

  &__input {
    box-sizing: border-box;
    height: 40px;
    font-size: 16px;
  }

  &__chips,
  &__pairs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__chip {
    padding: 4px 12px;
    background: #eaeef2;
    border-radius: 12px;
    font-size: 14px;
  }

  &__pair {
    flex: 0 0 calc((100% - 8px) / 2);
    padding: 8px 0;
    background: #eaeef2;
    border-radius: 8px;
    font-size: 14px;
    text-align: center;
  }

  &__center {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    background: #f6f8fa;
    font-size: 14px;
  }

  &__static {
    z-index: 3;
    font-size: 14px;
  }

  &__sticky {
    position: sticky;
    top: 0;
    margin: 0;
    background: #fff;
    font-size: 16px;
  }

  &__sticky-text {
    margin: 0;
    font-size: 14px;
  }
}
</style>
