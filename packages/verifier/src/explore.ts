import type { Defect, Scenario } from '@inspector-agent/core'
import type { Page } from 'playwright-core'

/**
 * 자동 탐색. 페이지에서 "눌러 보거나 올려 볼 만한 것"(툴팁·팝오버·드롭다운·모달·탭·아코디언 트리거)을 찾아
 * 하나씩 hover/click 해서 열린 상태의 레이아웃을 검사한다. 사용자가 시나리오를 쓰지 않아도 열린 UI 를 검사하기 위한 것이다.
 * 각 상태는 그 상태를 다시 만드는 시나리오(hover/click + wait)로 보관해, 패치 후 재측정이 같은 상태에서 잴 수 있다.
 */

export interface ExploreOptions {
  /** 한 뷰포트에서 시험할 트리거 수 상한. 기본 40 */
  maxTriggers?: number
  /** 한 뷰포트의 탐색 시간 상한(ms). 넘으면 남은 트리거는 건너뛴다. 기본 40000 */
  budgetMs?: number
}

export type ExploreAction = 'hover' | 'click'

export interface Trigger {
  selector: string
  label: string
  actions: ExploreAction[]
}

export interface ExploredState {
  scenario: Scenario
  defects: Defect[]
  documentOverflowPx: number
  durationMs: number
}

export const DEFAULT_MAX_TRIGGERS = 40
export const DEFAULT_BUDGET_MS = 40_000
/** 같은 모양(태그·클래스)의 트리거는 목록 렌더링(v-for)일 가능성이 커서 이만큼만 시험한다 */
const MAX_PER_SIGNATURE = 2
const ACTION_TIMEOUT_MS = 2000
/** 열림 전환(transition)이 끝나길 기다리는 시간 */
const OPEN_SETTLE_MS = 400
/** 데이터를 바꾸거나 이탈시킬 수 있는 일반 버튼은 누르지 않는다. 명시적 팝업 트리거(aria-haspopup 등)는 대상이 아니다 */
const DESTRUCTIVE_SOURCE =
  '삭제|제거|탈퇴|로그아웃|결제|구매|주문|전송|제출|발송|초기화|비우기|취소|저장|확인|동의|가입|로그인|delete|remove|logout|log out|sign out|pay|purchase|buy|order|submit|send|reset|clear|cancel|save|confirm|unsubscribe|checkout|sign in|sign up|log in'

/** 페이지 안에서 실행되어 트리거 후보를 모은다. 직렬화되어 브라우저로 가므로 바깥 변수를 쓰지 않는다 */
const collectTriggers = (args: { max: number; perSignature: number; destructive: string }): Trigger[] => {
  const destructive = new RegExp(args.destructive, 'i')
  // 영문자로 시작하고 CSS.escape 가 필요 없는 id 만 쓴다. 숫자는 허용하지만 uuid·해시처럼 매번 바뀌는 id 는 제외한다
  const stableId = (id: string): boolean => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) && !/\d{4,}|[A-Za-z0-9]{16,}/.test(id)

  const visible = (element: Element): boolean => {
    const rect = element.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && style.pointerEvents !== 'none'
  }

  const MAX_SELECTOR = 300
  /** 길이 상한 안에서 element 하나만 가리키는 선택자. 만들 수 없으면 undefined */
  const cssPath = (element: Element): string | undefined => {
    const parts: string[] = []
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) {
      if (current === document.body) {
        parts.unshift('body')
        break
      }
      if (current.id && stableId(current.id) && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(current.id)}`)
        break
      }
      const parent: Element | null = current.parentElement
      const index = parent ? Array.from(parent.children).indexOf(current) + 1 : 1
      parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`)
    }
    const full = parts.join(' > ')
    if (full.length <= MAX_SELECTOR) return full
    // 뒤쪽 N단계만 남긴다. 짧을수록 일치 범위가 넓어지므로 상한 안의 가장 긴 꼬리만 시험하면 된다
    let start = 0
    while (start < parts.length - 1 && parts.slice(start).join(' > ').length > MAX_SELECTOR) start++
    const tail = parts.slice(start).join(' > ')
    if (tail.length > MAX_SELECTOR) return undefined
    const matches = document.querySelectorAll(tail)
    return matches.length === 1 && matches[0] === element ? tail : undefined
  }

  const labelOf = (element: Element): string =>
    (element.getAttribute('aria-label') || (element.textContent ?? '').replace(/\s+/g, ' ').trim() || element.getAttribute('title') || element.tagName.toLowerCase()).slice(0, 40)

  const signatureOf = (element: Element): string => `${element.tagName}|${Array.from(element.classList).sort().join('.')}|${element.getAttribute('role') ?? ''}`

  const ignored = (element: Element): boolean =>
    element.closest('[data-ia-ignore], [inert], [aria-hidden="true"]') !== null ||
    (element as HTMLButtonElement).disabled === true ||
    element.getAttribute('aria-disabled') === 'true'

  const found: Trigger[] = []
  const counts = new Map<string, number>()
  const seen = new Set<Element>()
  const add = (element: Element, actions: ExploreAction[]): void => {
    if (found.length >= args.max || seen.has(element)) return
    const selector = cssPath(element)
    if (selector === undefined) return
    const signature = signatureOf(element)
    if ((counts.get(signature) ?? 0) >= args.perSignature) return
    counts.set(signature, (counts.get(signature) ?? 0) + 1)
    seen.add(element)
    found.push({ selector, label: labelOf(element), actions })
  }

  // 1) 열림을 선언한 트리거: 눌러서도, 올려서도 열릴 수 있다
  const declared =
    '[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded], [aria-controls], [aria-describedby], [data-bs-toggle], [data-toggle], [popovertarget], [data-tooltip], [data-tippy-content], [data-popover], [data-modal], [data-dialog], summary'
  for (const element of Array.from(document.querySelectorAll(declared))) {
    if (!ignored(element) && visible(element)) add(element, ['click', 'hover'])
  }

  // 2) 일반 버튼·탭: 제출 버튼과 위험해 보이는 라벨은 누르지 않는다
  for (const element of Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], a[href^="#"]'))) {
    if (ignored(element) || !visible(element)) continue
    if ((element as HTMLButtonElement).type === 'submit' || (element as HTMLButtonElement).type === 'reset') continue
    if (destructive.test(labelOf(element))) continue
    add(element, ['click'])
  }

  // 3) CSS :hover 로만 열리는 것: 숨겨진 절대 위치 자식을 가진 보이는 부모를 올려 본다
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const style = getComputedStyle(element)
    if (style.position !== 'absolute' && style.position !== 'fixed') continue
    const hidden = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
    const parent = element.parentElement
    if (!hidden || !parent || parent === document.body || ignored(parent) || !visible(parent)) continue
    add(parent, ['hover'])
  }

  return found
}

export const discoverTriggers = (page: Page, max: number = DEFAULT_MAX_TRIGGERS): Promise<Trigger[]> =>
  page.evaluate(collectTriggers, { max, perSignature: MAX_PER_SIGNATURE, destructive: DESTRUCTIVE_SOURCE })

/** 열림/닫힘으로 바뀌는 값을 한 줄로 요약한다. 시험 뒤 이 값이 처음과 다르면 페이지를 새로 연다 */
const stateSignature = (page: Page): Promise<string> =>
  page.evaluate(
    (): string =>
      [
        location.href,
        document.querySelectorAll('*').length,
        document.querySelectorAll('[aria-expanded="true"]').length,
        document.querySelectorAll('dialog[open], [aria-modal="true"]').length,
        document.body.style.overflow
      ].join('|')
  )

export interface ExploreDeps {
  url: string
  /** 현재 상태를 탐지한다. 클릭 상태에서는 포커스 이탈(키보드)까지 검사한다 */
  detectState: (withFocus: boolean) => Promise<{ defects: Defect[]; documentOverflowPx: number }>
  /** 페이지를 처음 상태로 되돌린다 */
  reload: () => Promise<void>
  /** 기본 상태에서 이미 보고된 결함의 fingerprint. 열린 상태에서 새로 생긴 것만 남긴다 */
  baseFingerprints: Set<string>
  options?: ExploreOptions
}

const scenarioFor = (action: ExploreAction, trigger: Trigger): Scenario => ({
  name: `자동 탐색: ${action} "${trigger.label}"`,
  description: '스캔이 찾은 트리거를 눌러/올려 연 상태',
  steps: [{ action, selector: trigger.selector }, { action: 'wait', ms: OPEN_SETTLE_MS }]
})

/**
 * 트리거를 하나씩 시험한다. 시험마다 열린 상태를 탐지하고, 상태가 바뀌었으면 페이지를 새로 열어 다음 시험이 깨끗한 상태에서 시작하게 한다.
 * 기본 상태와 같은 결함은 걸러 내므로 반환값은 "열었을 때만 생기는 결함"이다. 결함이 없는 상태도 돌려줘서 이전에 찾은 결함이 해결됐는지 판단할 수 있다.
 */
export const exploreStates = async (page: Page, deps: ExploreDeps): Promise<ExploredState[]> => {
  const { maxTriggers = DEFAULT_MAX_TRIGGERS, budgetMs = DEFAULT_BUDGET_MS } = deps.options ?? {}
  const startedAt = Date.now()
  const triggers = await discoverTriggers(page, maxTriggers)
  const baseSignature = await stateSignature(page)
  const states: ExploredState[] = []

  for (const trigger of triggers) {
    for (const action of trigger.actions) {
      if (Date.now() - startedAt > budgetMs) return states
      const stateStartedAt = Date.now()
      try {
        if (action === 'click') await page.click(trigger.selector, { timeout: ACTION_TIMEOUT_MS })
        else await page.hover(trigger.selector, { timeout: ACTION_TIMEOUT_MS })
        await page.waitForTimeout(OPEN_SETTLE_MS)
        const { defects, documentOverflowPx } = await deps.detectState(action === 'click')
        states.push({
          scenario: scenarioFor(action, trigger),
          defects: defects.filter((defect): boolean => !deps.baseFingerprints.has(defect.fingerprint)),
          documentOverflowPx,
          durationMs: Date.now() - stateStartedAt
        })
      } catch {
        // 가려져서 누를 수 없거나 사라진 트리거는 건너뛴다. 탐색은 보조 수단이라 한 트리거의 실패로 스캔을 멈추지 않는다
      }
      await page.keyboard.press('Escape').catch((): void => undefined)
      await page.mouse.move(0, 0)
      if ((await stateSignature(page).catch((): string => '')) !== baseSignature) await deps.reload()
    }
  }
  return states
}
