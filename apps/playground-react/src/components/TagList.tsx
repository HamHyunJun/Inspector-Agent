import type { ReactElement } from 'react'
import './TagList.css'

interface TagListProps {
  tags: string[]
}

export const TagList = ({ tags }: TagListProps): ReactElement => (
  <section className="tag-section" aria-labelledby="tag-heading">
    <h2 id="tag-heading" className="tag-section__heading">태그</h2>
    <ul className="tag-list">
      {tags.map((tag): ReactElement => (
        <li key={tag} className="tag-list__item">
          <span>#{tag}</span>
        </li>
      ))}
    </ul>
  </section>
)
