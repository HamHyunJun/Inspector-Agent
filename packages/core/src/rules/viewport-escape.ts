import { classifySeverity, diagnoseViewportEscape } from '../diagnose'
import { isTransformed } from '../dom-utils'
import { createDefectId, createFingerprint } from '../fingerprint'
import type { OverflowDefect, OverflowMetrics } from '../types'
import type { RuleContext } from './context'

/**
 * 뷰포트 이탈: 툴팁·팝오버·드롭다운처럼 절대/고정 위치로 띄운 요소가 화면 좌우 경계를 넘어 일부가 보이지 않는 경우.
 * 일반 오버플로우 규칙은 절대/고정 위치를 의도된 배치로 보고 건너뛰므로 여기서 따로 본다.
 * 클릭해야 열리는 UI 이므로 스캔 시나리오(click)로 연 상태에서 잘 잡힌다.
 */

/** 서브픽셀 반올림에 반응하지 않도록 이보다 적게 벗어나면 무시한다 */
const MIN_ESCAPE_PX = 2
/** 이보다 작은 박스는 시각적으로 숨긴 요소(sr-only, 1px 박스)이므로 제외한다 */
const MIN_BOX_PX = 8

interface Box {
  left: number
  right: number
  width: number
}

/**
 * 일부만 화면 밖으로 나간 양(px). 화면 밖으로 완전히 치워 둔 요소(오프캔버스 메뉴, 스킵 링크)는 의도된 숨김이라 0 이다.
 * 오른쪽은 스크롤로 닿을 수 있어도 가로 스크롤을 만들고, 왼쪽은 스크롤로도 닿을 수 없어 둘 다 결함으로 본다.
 */
export const viewportEscapePx = (box: Box, viewportWidth: number): number => {
  if (box.width < MIN_BOX_PX || box.right <= 0 || box.left >= viewportWidth) return 0
  const escape = Math.max(box.right - viewportWidth, -box.left)
  return escape >= MIN_ESCAPE_PX ? escape : 0
}

export const detectViewportEscape = (context: RuleContext): OverflowDefect[] => {
  const { elements, styleOf, snapshot, viewport, url, detectedAt } = context
  const found: Array<{ element: HTMLElement; defect: OverflowDefect }> = []

  for (const element of elements) {
    const style = styleOf(element)
    if (style.position !== 'absolute' && style.position !== 'fixed') continue
    // shortcut: 변환·투명·숨김 상태는 열림/닫힘 전환 중이거나 의도된 숨김으로 보고 건너뛴다. 전환 애니메이션이 끝난 뒤 스캔하도록 시나리오에 wait 를 둔다, 오탐이 보이면 애니메이션 감지로 업그레이드
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || isTransformed(style)) continue
    if (element.closest('svg') !== null || element.closest('[data-ia-ignore], [hidden], [inert], [aria-hidden="true"]') !== null) continue

    const rect = element.getBoundingClientRect()
    const escape = viewportEscapePx(rect, viewport.width)
    if (escape === 0) continue

    // shortcut: 조상 중 overflow 로 자르는 요소가 있으면 의도된 것으로 본다(실제 containing block 이 아니어도 건너뜀), 놓치는 사례가 나오면 containing block 추적으로 업그레이드
    let clipped = false
    for (let current = element.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
      if (styleOf(current).overflowX !== 'visible') {
        clipped = true
        break
      }
    }
    if (clipped) continue

    const parent = element.parentElement
    if (!parent) continue
    const node = snapshot(element)
    const fingerprint = createFingerprint('overflow-x', node.source, node.selector, viewport.width)
    const metrics: OverflowMetrics = {
      kind: 'overflow-x',
      mode: 'viewport',
      overflowPx: Math.round(escape * 100) / 100,
      overflowRatio: Math.round((escape / Math.max(rect.width, 1)) * 1000) / 1000,
      parentContentWidth: viewport.width,
      nodeWidth: Math.round(rect.width * 100) / 100
    }
    found.push({
      element,
      defect: {
        id: createDefectId(url, fingerprint),
        fingerprint,
        kind: 'overflow-x',
        severity: classifySeverity(metrics.overflowPx, false),
        url,
        viewport,
        node,
        parent: snapshot(parent),
        metrics,
        suggestions: diagnoseViewportEscape(node, metrics),
        detectedAt
      }
    })
  }

  // 팝업 안의 절대 위치 자식은 같은 원인이므로 가장 바깥 요소만 남긴다
  return found
    .filter(({ element }): boolean => !found.some((other): boolean => other.element !== element && other.element.contains(element)))
    .map(({ defect }): OverflowDefect => defect)
    .sort((a, b): number => b.metrics.overflowPx - a.metrics.overflowPx)
}
