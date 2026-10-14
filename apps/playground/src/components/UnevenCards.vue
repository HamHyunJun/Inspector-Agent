<template>
  <ul class="cards" aria-label="요금제">
    <li class="cards__item">베이직</li>
    <li class="cards__item">프로 요금제는 팀 단위 협업과 무제한 프로젝트를 지원합니다</li>
    <li class="cards__item">플러스</li>
  </ul>
</template>

<style lang="scss" scoped>
// [결함 정답] 좁은 화면에서 align-items: flex-start 라 같은 줄 카드 높이가 들쭉날쭉하다. 768px 이상에서는 stretch 로 높이가 같다
.cards {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (min-width: 768px) {
    align-items: stretch;
  }

  &__item {
    flex: 1;
    padding: 12px;
    background: #fff;
    border-radius: 12px;
    font-size: 14px;
  }
}
</style>
