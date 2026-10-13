import type { ReactElement } from 'react'
import './OrderTable.css'

export interface Order {
  id: string
  product: string
  quantity: number
  amount: number
  status: string
}

interface OrderTableProps {
  orders: Order[]
}

const formatAmount = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`

export const OrderTable = ({ orders }: OrderTableProps): ReactElement => (
  <section className="order-section">
    <h2 className="order-section__heading">최근 주문</h2>
    <section className="order-table" tabIndex={0} aria-label="최근 주문 표, 가로로 스크롤할 수 있습니다">
      <table className="order-table__table">
        <caption className="order-table__caption">최근 주문 내역</caption>
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
          {orders.map((order): ReactElement => (
            <tr key={order.id}>
              <th scope="row">{order.id}</th>
              <td>{order.product}</td>
              <td>{order.quantity}</td>
              <td>{formatAmount(order.amount)}</td>
              <td>{order.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </section>
)
