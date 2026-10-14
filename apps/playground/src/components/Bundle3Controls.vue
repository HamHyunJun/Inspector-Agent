<template>
  <section class="controls3" aria-label="묶음 3 정상 대조군">
    <p class="controls3__dark">충분히 진한 글자는 대비가 충분합니다</p>
    <p class="controls3__large">큰 글자는 대비 3:1 만 넘으면 됩니다</p>
    <form class="controls3__form" @submit.prevent>
      <label class="controls3__label" for="controls3-name">진한 테두리 입력창</label>
      <input id="controls3-name" class="controls3__input" type="text" />
    </form>
    <div class="controls3__status">
      <span class="controls3__icon" aria-hidden="true" />
      <span>가운데 정렬된 아이콘과 글자</span>
    </div>
    <button class="controls3__button" type="button">대칭 padding</button>
    <ul class="controls3__cards" aria-label="높이가 같은 카드">
      <li class="controls3__card">짧음</li>
      <li class="controls3__card">길게 줄바꿈되는 카드 내용이지만 stretch 라 높이가 같습니다</li>
    </ul>
    <article class="controls3__clip">
      <span class="controls3__badge">안쪽</span>
      <p class="controls3__name">배지가 안쪽에 있어 잘리지 않음</p>
    </article>
    <ul class="controls3__rail" aria-label="양쪽 여백이 같은 목록">
      <li v-for="name in names" :key="name" class="controls3__rail-card">{{ name }}</li>
    </ul>
    <div class="controls3__box" tabindex="0" aria-label="작은 스크롤 영역">
      <p v-for="line in lines" :key="line" class="controls3__line">{{ line }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
const names: string[] = ['재킷', '베스트', '팬츠', '배낭', '모자']
const lines: string[] = Array.from({ length: 10 }, (_, index): string => `작은 영역의 ${index + 1} 번째 줄`)
</script>

<style lang="scss" scoped>
// [정상 대조군] 묶음 3 규칙들이 정상 상태를 결함으로 잡지 않는지 확인한다. 이 파일에서 무엇이든 탐지되면 오탐이다
.controls3 {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
  font-size: 14px;

  &__dark {
    margin: 0;
    color: #24292f;
  }

  &__large {
    margin: 0;
    color: #8b949e;
    font-size: 24px;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__input {
    box-sizing: border-box;
    height: 40px;
    border: 1px solid #6e7781;
    font-size: 16px;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    background: #2da44e;
    border-radius: 50%;
  }

  &__button {
    align-self: flex-start;
    min-width: 96px;
    padding: 12px 16px;
  }

  &__cards {
    display: flex;
    gap: 8px;
    align-items: stretch;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__card {
    flex: 1;
    padding: 12px;
    background: #f6f8fa;
    border-radius: 12px;
  }

  &__clip {
    position: relative;
    overflow: hidden;
    padding: 16px;
    background: #f6f8fa;
    border-radius: 12px;
  }

  &__badge {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 4px 8px;
    background: #cf222e;
    border-radius: 12px;
    color: #fff;
    font-size: 12px;
  }

  &__name {
    margin: 0;
  }

  &__rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 0;
    padding: 0 16px;
    list-style: none;
  }

  &__rail-card {
    flex: 0 0 120px;
    padding: 12px;
    background: #f6f8fa;
    border-radius: 12px;
  }

  &__box {
    height: 120px;
    overflow-y: auto;
    padding: 8px;
    background: #f6f8fa;
  }

  &__line {
    margin: 0 0 8px;
  }
}
</style>
