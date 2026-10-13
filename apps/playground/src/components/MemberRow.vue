<template>
  <section class="member-panel">
    <h2 class="member-panel__heading">멤버</h2>
    <ul class="member-panel__list">
      <li class="member-row">
        <span class="member-row__name">Alexandria-Montgomery</span>
        <span class="member-row__badge">3</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
// [정답 결함, 연쇄] 줄바꿈 없는 긴 이름이 알약(flex 줄)을 넘치면서 뒤의 배지를 부모 밖으로 밀어낸다.
// 원인은 이름 하나이므로 결함 하나(이름)에 배지가 연쇄 결함으로 묶여야 한다. 768px 이상에서는 알약이 넓어져 정상이다
.member-panel {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
}

.member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 160px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #d0d7de;
  border-radius: 999px;
  font-size: 14px;

  @media (min-width: 768px) {
    width: auto;
  }

  &__name {
    white-space: nowrap;
  }

  &__badge {
    min-width: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: #ddf4ff;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }
}
</style>
