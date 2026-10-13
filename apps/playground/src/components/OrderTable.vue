<template>
  <section class="order-section">
    <h2 class="order-section__heading">최근 주문</h2>
    <section class="order-table" tabindex="0" aria-label="최근 주문 표, 가로로 스크롤할 수 있습니다">
      <table class="order-table__table">
        <caption class="order-table__caption">최근 주문 내역</caption>
        <thead>
          <tr>
            <th scope="col">주문 번호</th>
            <th scope="col">상품</th>
            <th scope="col">수량</th>
            <th scope="col">금액</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <th scope="row">{{ order.id }}</th>
            <td>{{ order.product }}</td>
            <td>{{ order.quantity }}</td>
            <td>{{ formatAmount(order.amount) }}</td>
            <td>{{ order.status }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
export interface Order {
  id: string
  product: string
  quantity: number
  amount: number
  status: string
}

defineProps<{
  orders: Order[]
}>()

const formatAmount = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`
</script>

<style lang="scss" scoped>
// [정상 대조군] overflow-x: auto 로 의도된 가로 스크롤. 탐지되면 오탐이다
.order-section {
  padding: 16px;
  background: #fff;
  border-radius: 12px;

  &__heading {
    margin: 0 0 8px;
    font-size: 16px;
  }
}

.order-table {
  overflow-x: auto;

  &__table {
    min-width: 560px;
    border-collapse: collapse;
    font-size: 14px;

    th,
    td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid #d0d7de;
    }
  }

  &__caption {
    text-align: left;
    font-size: 12px;
    color: #57606a;
  }
}
</style>
