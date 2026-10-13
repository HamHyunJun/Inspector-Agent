import type { ReactElement } from 'react'
import styles from './ProductCard.module.scss'

interface ProductCardProps {
  title: string
  price: number
}

export const ProductCard = ({ title, price }: ProductCardProps): ReactElement => (
  <article className={styles['product-card']}>
    <span className={styles['product-card__thumb']} aria-hidden="true">🧥</span>
    <section className={styles['product-card__info']}>
      <h2 className={styles['product-card__title']}>{title}</h2>
      <p className={styles['product-card__price']}>{`${price.toLocaleString('ko-KR')}원`}</p>
    </section>
  </article>
)
