import type { ReactElement } from 'react'
import './PromoBanner.scss'

export const PromoBanner = (): ReactElement => (
  <section className="promo-banner">
    <aside className="promo-banner__box">
      <p className="promo-banner__text">가을 시즌 오프 최대 40% 할인</p>
    </aside>
  </section>
)
