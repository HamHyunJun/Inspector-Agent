import type { ReactElement } from 'react'
import { OrderTable } from './components/OrderTable'
import type { Order } from './components/OrderTable'
import { BadgeCard } from './components/BadgeCard'
import { ProductCard } from './components/ProductCard'
import { PromoBanner } from './components/PromoBanner'
import { ShareLink } from './components/ShareLink'
import { TagList } from './components/TagList'
import './App.scss'

const tags = ['방수', '경량', '고어텍스', '아웃도어', '트레킹', '한정판', '무료배송']
const orders: Order[] = [
  { id: 'A-1024', product: '트레킹 재킷', quantity: 1, amount: 189000, status: '배송 중' },
  { id: 'A-1025', product: '경량 패딩 베스트', quantity: 2, amount: 158000, status: '결제 완료' }
]

export const App = (): ReactElement => (
  <>
    <header className="app-header">
      <h1 className="app-header__title">Inspector-Agent React Playground</h1>
      <p className="app-header__desc">375px 뷰포트에서 레이아웃 오버플로우가 발생하도록 결함을 심어 둔 React 화면입니다.</p>
    </header>
    <main className="app-main">
      <ProductCard title="초경량 듀얼 레이어 방수 트레킹 재킷 2026 FW 한정판 컬러 에디션" price={189000} />
      <TagList tags={tags} />
      <PromoBanner />
      <ShareLink url="https://example.com/campaign/2026/autumn/landing?utm_source=newsletter&utm_medium=email&utm_campaign=inspector_agent_demo" />
      <OrderTable orders={orders} />
      <BadgeCard />
    </main>
  </>
)
