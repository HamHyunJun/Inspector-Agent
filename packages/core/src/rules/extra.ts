import type { OverflowDefect } from '../types'
import { detectAnchorTarget } from './anchor-target'
import type { RuleContext } from './context'
import { detectDeadCss } from './dead-css'
import { detectFieldClipping } from './field-clipping'
import { detectFixedLayers } from './fixed-layers'
import { detectImageQuality } from './image-quality'
import { detectInteraction } from './interaction'
import { detectLayoutGaps } from './layout-gaps'
import { detectPageHealth } from './page-health'
import { detectScrollAreas } from './scroll-areas'
import { detectTypography } from './typography'
import { detectVisual } from './visual'

/** Finding 기반의 가벼운 규칙들을 한 번에 실행한다. 규칙을 추가하면 여기에 한 줄만 더한다 */
export const detectExtraRules = (context: RuleContext): OverflowDefect[] => [
  ...detectTypography(context),
  ...detectImageQuality(context),
  ...detectFixedLayers(context),
  ...detectFieldClipping(context),
  ...detectDeadCss(context),
  ...detectAnchorTarget(context),
  ...detectLayoutGaps(context),
  ...detectPageHealth(context),
  ...detectInteraction(context),
  ...detectVisual(context),
  ...detectScrollAreas(context)
]
