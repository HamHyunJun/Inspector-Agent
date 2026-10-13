<template>
  <article class="product-card">
    <span class="product-card__thumb" aria-hidden="true">🧥</span>
    <section class="product-card__info">
      <h2 class="product-card__title">{{ title }}</h2>
      <p class="product-card__price">{{ formattedPrice }}</p>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  price: number
}>()

const formattedPrice = computed((): string => `${props.price.toLocaleString('ko-KR')}원`)
</script>

<style lang="scss" scoped>
// [심어 둔 결함] flex item(.product-card__info)의 min-width 기본값 auto + 줄바꿈 없는 제목
.product-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__thumb {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    font-size: 32px;
    line-height: 56px;
    text-align: center;
    background: #eef1f4;
    border-radius: 8px;
  }

  &__title {
    margin: 0;
    font-size: 16px;
    white-space: nowrap;
  }

  &__price {
    margin: 4px 0 0;
    font-weight: 700;
  }
}
</style>
