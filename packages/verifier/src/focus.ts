import { createDefectId, createFingerprint, diagnoseFocus } from '@inspector-agent/core'
import type { DetectOptions, FocusDefect, FocusState, ModalProbe, NodeSnapshot, OverflowDefect, Viewport } from '@inspector-agent/core'
import type { Page } from 'playwright-core'

/**
 * 모달 포커스 트랩 검사. 실제 키보드로 Tab/Shift+Tab 을 눌러 포커스가 모달 밖으로 나가는지 본다.
 * (포커스 이동은 브라우저가 계산하므로 DOM 수치만으로는 판정할 수 없다)
 */

export interface FocusProbeResult {
  /** 첫 요소에서 앞으로 Tab 을 누르다 나간 경우 몇 번째 Tab 에서 나갔는지 */
  forward?: { presses: number; escapedTo?: NodeSnapshot }
  /** 첫 요소에서 Shift+Tab 한 번에 나간 경우 */
  backward?: { escapedTo?: NodeSnapshot }
}

export const buildFocusDefect = (
  modal: ModalProbe,
  result: FocusProbeResult,
  context: { url: string; viewport: Viewport; detectedAt: string }
): FocusDefect => {
  const fingerprint = createFingerprint('focus-escape', modal.node.source, modal.node.selector, context.viewport.width)
  const metrics: FocusDefect['metrics'] = {
    kind: 'focus-escape',
    trigger: modal.trigger,
    focusableCount: modal.focusableCount,
    escapesForward: result.forward !== undefined,
    escapesBackward: result.backward !== undefined,
    tabsToEscape: result.forward?.presses,
    escapedTo: result.forward?.escapedTo ?? result.backward?.escapedTo
  }
  return {
    id: createDefectId(context.url, fingerprint),
    fingerprint,
    kind: 'focus-escape',
    // 키보드 사용자가 모달 뒤의 페이지를 조작하게 되므로 항상 높음
    severity: 'high',
    url: context.url,
    viewport: context.viewport,
    node: modal.node,
    parent: modal.parent,
    metrics,
    suggestions: diagnoseFocus(metrics),
    detectedAt: context.detectedAt
  }
}

const probeDirection = async (
  page: Page,
  modal: ModalProbe,
  key: 'Tab' | 'Shift+Tab',
  maxPresses: number,
  sourceAttribute: string | undefined
): Promise<{ presses: number; state: FocusState } | undefined> => {
  const focused = await page.evaluate((index): boolean => window.__INSPECTOR_AGENT__?.focusFirstInModal(index) ?? false, modal.index)
  if (!focused) return undefined
  for (let presses = 1; presses <= maxPresses; presses++) {
    await page.keyboard.press(key)
    const state = await page.evaluate(
      ({ index, attribute }): FocusState => window.__INSPECTOR_AGENT__?.modalFocusState(index, { sourceAttribute: attribute }) ?? { inside: true },
      { index: modal.index, attribute: sourceAttribute }
    )
    if (!state.inside) return { presses, state }
  }
  return undefined
}

/** 열려 있는 모든 모달에서 앞/뒤 Tab 이동이 모달 안에 머무는지 시험하고, 빠져나가는 모달마다 결함 하나를 만든다 */
export const scanFocusEscapes = async (page: Page, url: string, viewport: Viewport, detect: DetectOptions = {}): Promise<FocusDefect[]> => {
  const modals = await page.evaluate(
    (options): ModalProbe[] => window.__INSPECTOR_AGENT__?.findModals(options) ?? [],
    { sourceAttribute: detect.sourceAttribute }
  )
  const detectedAt = new Date().toISOString()
  const defects: FocusDefect[] = []
  for (const modal of modals) {
    // 첫 요소에서 마지막 요소까지 focusableCount-1 번, 한 번 더 누르면 순환해야 한다
    const forward = await probeDirection(page, modal, 'Tab', modal.focusableCount + 1, detect.sourceAttribute)
    const backward = await probeDirection(page, modal, 'Shift+Tab', 1, detect.sourceAttribute)
    if (!forward && !backward) continue
    defects.push(
      buildFocusDefect(
        modal,
        {
          forward: forward ? { presses: forward.presses, escapedTo: forward.state.active } : undefined,
          backward: backward ? { escapedTo: backward.state.active } : undefined
        },
        { url, viewport, detectedAt }
      )
    )
  }
  return defects
}

/** Tab 으로 한 바퀴 도는 정류장 수 상한(브라우저 쪽 MAX_STOPS 와 같은 값이어야 한다) */
const MAX_TAB_STOPS = 60

/**
 * 실제 Tab 키로 문서를 한 바퀴 돌며 포커스 표시 없음, 고정 요소가 포커스를 가림, 화면 순서를 거스른 이동을 찾는다.
 * 키 입력이 포커스·스크롤을 바꾸므로 레이아웃 탐지가 끝난 뒤에 호출하고, 끝나면 포커스와 스크롤을 되돌린다.
 */
export const scanTabStops = async (page: Page, detect: DetectOptions = {}): Promise<OverflowDefect[]> => {
  const started = await page.evaluate((): boolean => {
    const agent = window.__INSPECTOR_AGENT__
    if (!agent) return false
    agent.beginTabProbe()
    return true
  })
  if (!started) return []
  for (let press = 0; press < MAX_TAB_STOPS; press++) {
    await page.keyboard.press('Tab')
    const { done } = await page.evaluate((): { done: boolean } => window.__INSPECTOR_AGENT__?.recordTabStop() ?? { done: true })
    if (done) break
  }
  return page.evaluate((options): OverflowDefect[] => window.__INSPECTOR_AGENT__?.finishTabProbe(options) ?? [], { sourceAttribute: detect.sourceAttribute })
}
