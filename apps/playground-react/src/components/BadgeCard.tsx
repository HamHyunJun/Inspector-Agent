import type { ReactElement } from 'react'
import styles from './BadgeCard.module.scss'

export const BadgeCard = (): ReactElement => (
  <article className={styles.card}>
    <h2 className={styles.title}>신상품</h2>
    <p className={styles.desc}>카드 모서리에 겹쳐 올라온 배지와 장식 요소</p>
    <small className={styles.hint} aria-hidden="true">장식 힌트</small>
    <span className={styles.badge}>NEW</span>
  </article>
)
