<template>
  <section class="clip-controls">
    <h2 class="clip-controls__heading">텍스트 잘림 대조군</h2>

    <p class="clip-controls__ellipsis">Ultralight-Backpacking-Titanium-Cookset 2026 에디션</p>

    <label class="clip-controls__field" for="clip-controls-input">입력창</label>
    <input id="clip-controls-input" class="clip-controls__input" type="text" value="입력창은 값이 길어도 스크롤해서 보므로 잘림 결함이 아닙니다 Ultralight-Backpacking-Titanium-Cookset" />

    <span class="clip-controls__sr-only">화면에는 보이지 않고 스크린 리더만 읽는 문구입니다</span>

    <ul class="clip-controls__track" aria-label="가로 캐러셀">
      <li v-for="card in cards" :key="card" class="clip-controls__card">{{ card }}</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
const cards = ['캠핑 장비 체크리스트 카드 하나', '일정 공유 카드 두 번째', '멤버 초대 카드 세 번째', '준비물 분배 카드 네 번째']
</script>

<style lang="scss" scoped>
// [정상 대조군] 말줄임(ellipsis), 입력창, 시각적으로만 숨긴 문구(sr-only), 가로 캐러셀은 텍스트 잘림으로 탐지되면 오탐이다
.clip-controls {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__ellipsis {
    box-sizing: border-box;
    width: 140px;
    margin: 0 0 12px;
    padding: 4px 8px;
    overflow: hidden;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
  }

  &__input {
    box-sizing: border-box;
    width: 160px;
    margin-bottom: 12px;
  }

  &__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  &__track {
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    list-style: none;
  }

  &__card {
    flex: 0 0 200px;
    padding: 8px;
    background: #f6f8fa;
    border-radius: 8px;
    font-size: 14px;
  }
}
</style>
