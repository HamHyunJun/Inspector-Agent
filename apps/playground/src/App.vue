<template>
  <header class="app-header">
    <h1 class="app-header__title">Inspector-Agent Playground</h1>
    <p class="app-header__desc">375px 뷰포트에서 레이아웃 오버플로우가 발생하도록 결함을 심어 둔 화면입니다.</p>
  </header>
  <main class="app-main">
    <!-- ?page=members 는 같은 컴포넌트를 다른 URL 에서 보여 주는 용도(대시보드 URL 그룹핑 재현) -->
    <MemberRow v-if="page === 'members'" />
    <template v-else>
      <ShiftBanner />
      <DecorDots />
      <ProductCard
        title="초경량 듀얼 레이어 방수 트레킹 재킷 2026 FW 한정판 컬러 에디션"
        :price="189000"
      />
      <TagList :tags="tags" />
      <PromoBanner />
      <FixedHeightCard />
      <ClippedLabel />
      <MemberRow />
      <SeededChip />
      <SquishedNotice />
      <IconControls />
      <OverlapHeading />
      <LineHeightControls />
      <BrokenHero />
      <StretchedThumb />
      <ThumbControls />
      <TinyCloseBar />
      <TapControls />
      <NarrowLabel />
      <WrapControls />
      <ShareLink url="https://example.com/campaign/2026/autumn/landing?utm_source=newsletter&utm_medium=email&utm_campaign=inspector_agent_demo" />
      <OrderTable :orders="orders" />
      <SortMenu />
      <BadgeCard />
      <HeightControls />
      <TextClipControls />
      <ModalControl />
      <ShareSheet />
      <OpenMenu />
      <ClippedMenu />
      <FilterDropdown />
      <ConfirmDialog />
      <ExtraCases />
    </template>
  </main>
  <SiteFooter />
</template>

<script setup lang="ts">
import OrderTable from './components/OrderTable.vue'
import BadgeCard from './components/BadgeCard.vue'
import BrokenHero from './components/BrokenHero.vue'
import ClippedLabel from './components/ClippedLabel.vue'
import ClippedMenu from './components/ClippedMenu.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DecorDots from './components/DecorDots.vue'
import ExtraCases from './components/ExtraCases.vue'
import FilterDropdown from './components/FilterDropdown.vue'
import FixedHeightCard from './components/FixedHeightCard.vue'
import HeightControls from './components/HeightControls.vue'
import IconControls from './components/IconControls.vue'
import LineHeightControls from './components/LineHeightControls.vue'
import MemberRow from './components/MemberRow.vue'
import ModalControl from './components/ModalControl.vue'
import NarrowLabel from './components/NarrowLabel.vue'
import OverlapHeading from './components/OverlapHeading.vue'
import OpenMenu from './components/OpenMenu.vue'
import ShiftBanner from './components/ShiftBanner.vue'
import SeededChip from './components/SeededChip.vue'
import StretchedThumb from './components/StretchedThumb.vue'
import SiteFooter from './components/SiteFooter.vue'
import SquishedNotice from './components/SquishedNotice.vue'
import ShareSheet from './components/ShareSheet.vue'
import ProductCard from './components/ProductCard.vue'
import PromoBanner from './components/PromoBanner.vue'
import ShareLink from './components/ShareLink.vue'
import SortMenu from './components/SortMenu.vue'
import TinyCloseBar from './components/TinyCloseBar.vue'
import ThumbControls from './components/ThumbControls.vue'
import TapControls from './components/TapControls.vue'
import TextClipControls from './components/TextClipControls.vue'
import WrapControls from './components/WrapControls.vue'
import TagList from './components/TagList.vue'
import type { Order } from './components/OrderTable.vue'

const page = new URLSearchParams(window.location.search).get('page')
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

  // 화면 아래에 고정된 안내 띠(FixedBanner, 40vh)가 마지막 내용을 가리지 않게 비워 둔다
  @media (max-width: 480px) {
    padding-bottom: calc(16px + 40vh);
  }
}
</style>
