import type { ReactElement } from 'react'
import styles from './ShareLink.module.css'

interface ShareLinkProps {
  url: string
}

export const ShareLink = ({ url }: ShareLinkProps): ReactElement => (
  <section className={styles.shareLink}>
    <h2 className={styles.heading}>공유 링크</h2>
    <p className={styles.url}>{url}</p>
  </section>
)
