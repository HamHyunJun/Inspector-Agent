<template>
  <header class="app-header">
    <h1 class="app-header__title">Inspector-Agent Playground</h1>
    <p class="app-header__desc">375px 뷰포트에서 레이아웃 오버플로우가 발생하도록 결함을 심어 둔 화면입니다.</p>
  </header>
  <main class="app-main">
    <ProductCard
      title="초경량 듀얼 레이어 방수 트레킹 재킷 2026 FW 한정판 컬러 에디션"
      :price="189000"
    />
    <TagList :tags="tags" />
    <PromoBanner />
    <ShareLink url="https://example.com/campaign/2026/autumn/landing?utm_source=newsletter&utm_medium=email&utm_campaign=inspector_agent_demo" />
    <OrderTable :orders="orders" />
    <SortMenu />
    <BadgeCard />
    <ModalControl />
    <ShareSheet />
    <ClippedMenu />
    <FilterDropdown />
    <ConfirmDialog />
  </main>
</template>

<script setup lang="ts">
import OrderTable from './components/OrderTable.vue'
import BadgeCard from './components/BadgeCard.vue'
import ClippedMenu from './components/ClippedMenu.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import FilterDropdown from './components/FilterDropdown.vue'
import ModalControl from './components/ModalControl.vue'
import ShareSheet from './components/ShareSheet.vue'
import ProductCard from './components/ProductCard.vue'
import PromoBanner from './components/PromoBanner.vue'
import ShareLink from './components/ShareLink.vue'
import SortMenu from './components/SortMenu.vue'
import TagList from './components/TagList.vue'
import type { Order } from './components/OrderTable.vue'

const tags = ['방수', '경량', '고어텍스', '아웃도어', '트레킹', '한정판', '무료배송']
const orders: Order[] = [
  { id: 'A-1024', product: '트레킹 재킷', quantity: 1, amount: 189000, status: '배송 중' },
  { id: 'A-1025', product: '경량 패딩 베스트', quantity: 2, amount: 158000, status: '결제 완료' }
]
</script>

<style lang="scss" scoped>
.app-header {
  padding: 24px 16px 8px;

  &__title {
    margin: 0;
    font-size: 20px;
  }

  &__desc {
    margin: 8px 0 0;
    font-size: 14px;
    color: #57606a;
  }
}

.app-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-width: 720px;
  margin: 0 auto;
}
</style>
