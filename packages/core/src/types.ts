/**
 * Inspector-Agent 전 구간(확장, 검증기, 대시보드, MCP)이 공유하는 데이터 계약.
 * 결함 페이로드는 "LLM에 보낼 최소 정보"를 기준으로 설계한다.
 */

/**
 * - overflow-x: 가로 레이아웃 오버플로우
 * - overflow-y: 높이가 제한된 컨테이너 밖으로 흐름 안의 콘텐츠가 세로로 넘쳐 아래 요소와 겹침
 * - clipped-text: overflow 로 잘리는데 말줄임(text-overflow: ellipsis)이 없어 글자가 잘린 줄 모르게 사라짐
 * - occluded: 모달/드롭다운 같은 "위에 있어야 할" 요소가 다른 요소에 가려짐
 * - focus-escape: 모달이 열려 있는데 Tab 키 포커스가 모달 밖으로 빠져나감 (실제 키 입력이 필요해 verifier 가 탐지한다)
 */
export type DefectKind = 'overflow-x' | 'overflow-y' | 'clipped-text' | 'occluded' | 'focus-escape'

/**
 * 오버플로우 발생 형태
 * - box: 요소의 박스 자체가 부모 콘텐츠 영역 밖으로 밀려남 (예: flex item min-width:auto)
 * - content: 요소 박스는 맞지만 내부 텍스트/인라인 콘텐츠가 박스를 넘침 (예: nowrap, 긴 URL)
 * - viewport: 절대/고정 위치로 띄운 툴팁·팝오버가 화면 좌우 경계 밖으로 나감 (부모가 아니라 뷰포트가 기준)
 * - squished: flex 줄 안의 아이콘·이미지가 공간이 모자라 한쪽 축으로만 줄어 비율이 깨짐 (overflowPx 는 줄어든 양)
 * - doc-width: 페이지가 가로로 넘치는데 뷰포트 너비로만 그려진 전체 너비 블록의 배경·우측 여백이 끊김 (overflowPx 는 모자란 너비, parentContentWidth 는 문서 전체 너비)
 * - overlap: 흐름 안의 글·이미지·컨트롤이 다른 덩어리의 글·이미지·컨트롤 위에 얹힘 (overflowPx 는 떼어 놓으려면 옮겨야 하는 거리, node 는 나중에 그려져 위에 놓인 쪽)
 * - distorted: <img> 가 원본 비율과 다른 박스에 object-fit: fill 로 그려져 늘어남 (overflowPx 는 비율에 맞는 높이와의 차이, parentContentWidth 는 비율에 맞는 높이, nodeWidth 는 실제 그려진 높이)
 * - tap-target: 터치 화면에서 24px 보다 작은 버튼·링크가 다른 타겟과 붙어 있어 잘못 누르기 쉬움 (overflowPx 는 기준에 모자란 px, parentContentWidth 는 기준 크기 24, nodeWidth 는 실제 짧은 변)
 * - stacked-text: 칸이 너무 좁아 단어가 한두 글자씩 세로로 줄바꿈됨 (overflowPx 는 세로로 늘어난 높이, parentContentWidth 는 줄 수, nodeWidth 는 한 줄 평균 글자 수)
 * - broken-image: <img> 가 로드에 실패해 빈 사각형이나 대체 텍스트만 보임 (overflowPx 는 깨진 이미지가 차지한 큰 변)
 * - tiny-text / tight-leading / input-zoom / text-orphan: 타이포그래피 결함 (rules/typography.ts, 설명은 metrics.detail)
 */
export type OverflowMode =
  | 'box'
  | 'content'
  | 'viewport'
  | 'squished'
  | 'doc-width'
  | 'overlap'
  | 'distorted'
  | 'tap-target'
  | 'stacked-text'
  | 'broken-image'
  | 'tiny-text'
  | 'tight-leading'
  | 'input-zoom'
  | 'text-orphan'
  | 'blurry-image'
  | 'oversized-image'
  | 'fixed-hog'
  | 'fixed-overlap'
  | 'field-clipped'
  | 'sticky-inert'
  | 'z-index-inert'
  | 'anchor-missing'
  | 'resource-failed'
  | 'mixed-content'
  | 'font-failed'
  | 'console-error'
  | 'empty-space'
  | 'lonely-wrap'
  | 'focus-ring-missing'
  | 'focus-covered'
  | 'focus-order'
  | 'click-blocked'
  | 'fake-button'
  | 'hover-only'
  | 'scroll-locked'
  | 'layout-shift'
  | 'tabindex-positive'
  | 'low-contrast'
  | 'border-contrast'
  | 'long-line'
  | 'text-off-center'
  | 'icon-misaligned'
  | 'uneven-cards'
  | 'viewport-height'
  | 'corner-clipped'
  | 'scroll-end-flush'
  | 'nested-scroll'

export type Severity = 'low' | 'medium' | 'high'

export interface Viewport {
  width: number
  height: number
}

/** Vite 플러그인이 주입한 data-ia-src="파일:라인:컬럼" 해석 결과 */
export interface SourceLocation {
  file: string
  line: number
  column: number
  /** 노드 자신이 아닌 가장 가까운 조상의 위치를 빌려 온 경우 false */
  exact: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  right: number
  bottom: number
}

/** 결함 노드 또는 직계 부모 한 개의 압축 스냅샷 */
export interface NodeSnapshot {
  selector: string
  tag: string
  classes: string[]
  source?: SourceLocation
  rect: Rect
  scrollWidth: number
  clientWidth: number
  /** 레이아웃 관련 속성 중 기본값이 아닌 것만 담는다 */
  styles: Record<string, string>
  childElementCount: number
  /** 직계 자식 요소들의 클래스 (중복 제거, 최대 8개). 자식이 원인인 경우(예: nowrap 제목) 규칙 탐색에 쓴다 */
  childClasses: string[]
  /** 노드가 직접 가진 텍스트 일부 (최대 60자) */
  text?: string
}

/** 결정론적 진단 규칙 식별자 */
export type FixHint =
  | 'flex-item-min-width'
  | 'flex-shrink-disabled'
  | 'flex-nowrap'
  | 'nowrap-text'
  | 'unbreakable-text'
  | 'fixed-width'
  | 'media-max-width'
  | 'stacking-context-trap'
  | 'z-index-too-low'
  | 'overflow-clipped-popup'
  | 'focus-trap-missing'
  | 'fixed-height'
  | 'vertical-scroll'
  | 'text-ellipsis'
  | 'text-wrap'
  | 'keep-in-viewport'
  | 'document-overflow-source'
  | 'sibling-overlap'
  | 'image-aspect-ratio'
  | 'tap-target-size'
  | 'stacked-text'
  | 'image-load-failed'
  | 'min-font-size'
  | 'line-height-tight'
  | 'input-font-size'
  | 'text-orphan'
  | 'image-resolution'
  | 'fixed-layer-size'
  | 'fixed-layer-overlap'
  | 'field-text-clipped'
  | 'sticky-container-overflow'
  | 'z-index-without-position'
  | 'anchor-target'
  | 'resource-load-failed'
  | 'mixed-content'
  | 'font-load-failed'
  | 'console-error'
  | 'empty-space'
  | 'lonely-wrap-item'
  | 'focus-indicator'
  | 'focus-scroll-padding'
  | 'focus-order'
  | 'click-blocked'
  | 'fake-button'
  | 'hover-only-menu'
  | 'scroll-locked'
  | 'layout-shift'
  | 'tabindex-positive'
  | 'text-contrast'
  | 'border-contrast'
  | 'line-length'
  | 'text-centering'
  | 'align-items-center'
  | 'equal-height-cards'
  | 'dynamic-viewport-height'
  | 'overflow-visible-parent'
  | 'scroll-end-padding'
  | 'nested-scroll'

export interface FixSuggestion {
  hint: FixHint
  /** 선언을 추가할 대상. ancestor 는 직계 부모가 아닌 조상(스택킹 컨텍스트를 만든 요소, overflow 로 자르는 요소) */
  target: 'node' | 'parent' | 'ancestor'
  declarations: Record<string, string>
  reason: string
}

/** 한 원인이 밀어내서 함께 넘친 형제 결함. 원인을 고치면 같이 사라지므로 별도 결함으로 세지 않는다 */
export interface CascadedDefect {
  selector: string
  source?: SourceLocation
  overflowPx: number
}

export interface OverflowMetrics {
  kind: 'overflow-x'
  mode: OverflowMode
  /** 넘친 양(px). 패치 후 0이 되어야 한다 */
  overflowPx: number
  /** overflowPx / 부모 콘텐츠 너비 */
  overflowRatio: number
  parentContentWidth: number
  nodeWidth: number
  /** 이 결함이 밀어낸 같은 줄의 뒤쪽 형제 결함 (연쇄 결함) */
  cascaded?: CascadedDefect[]
  /** 규칙이 직접 쓴 한 줄 설명. 있으면 요약 문장이 이 값을 그대로 쓴다 */
  detail?: string
}

/** 한 stacking context(또는 그 안에서 겨루는 대표 요소)의 요약 */
export interface StackingLayer {
  selector: string
  /** auto 이면 undefined */
  zIndex?: number
  /** 이 요소가 stacking context 를 만드는 이유 (예: transform, opacity<1, position+z-index). 만들지 않으면 'none' */
  reason: string
  source?: SourceLocation
}

export interface VerticalOverflowMetrics {
  kind: 'overflow-y'
  /** 컨테이너 아래로 넘친 양(px). 패치 후 0이 되어야 한다 */
  overflowPx: number
  containerHeight: number
  /** 컨테이너 안 흐름(in-flow) 콘텐츠가 차지하는 높이 */
  contentHeight: number
  /** 가장 많이 넘친 자식 요소(텍스트가 직접 넘치면 없음) */
  culprit?: { selector: string; source?: SourceLocation }
}

export interface ClippedTextMetrics {
  kind: 'clipped-text'
  /** 잘려서 보이지 않는 텍스트 너비(px). 패치 후 0이 되어야 한다 */
  clippedPx: number
  /** 전체 텍스트 너비 대비 잘린 비율 (0~1) */
  hiddenRatio: number
  /** 잘리는 요소의 보이는 너비 / 텍스트 전체 너비 */
  visibleWidth: number
  fullWidth: number
  /** 잘리는 텍스트 일부 (최대 60자) */
  text: string
  whiteSpace: string
}

export interface OcclusionMetrics {
  kind: 'occluded'
  /** 표본점 중 가려진 비율 (0~1). 패치 후 0이 되어야 한다 */
  coveredRatio: number
  sampledPoints: number
  /** 가린 요소 */
  occluder: NodeSnapshot
  /** 공통 조상 stacking context 안에서 서로 겨루는 대표 요소. node 가 조상 컨텍스트에 갇혔으면 nodeLayer 는 그 조상이다 */
  nodeLayer: StackingLayer
  occluderLayer: StackingLayer
  /**
   * 가려진 원인
   * - stacking-context: node 가 조상이 만든 stacking context 에 갇혀 자기 z-index 를 올려도 소용없음
   * - z-index: 같은 컨텍스트에서 z-index/DOM 순서가 밀림
   * - overflow-clip: 조상의 overflow 가 잘라냄
   * - unknown: 규칙으로 분류하지 못함 (원인을 단정하지 않는다)
   */
  cause: 'stacking-context' | 'z-index' | 'overflow-clip' | 'unknown'
  /** overflow 로 잘려 가려진 경우 잘라내는 조상 */
  clippedBy?: { selector: string; overflow: string; source?: SourceLocation }
}

/** 모달로 판정한 근거 */
export type ModalTrigger = 'aria-modal' | 'alertdialog' | 'fixed-dialog'

export interface FocusMetrics {
  kind: 'focus-escape'
  trigger: ModalTrigger
  /** 모달 안 포커스 가능한 요소 수 */
  focusableCount: number
  /** 첫 요소에서 Tab 을 누르다 모달 밖으로 나갔는가 / Shift+Tab 으로 나갔는가 */
  escapesForward: boolean
  escapesBackward: boolean
  /** 앞으로 몇 번째 Tab 에서 빠져나갔는지 (escapesForward 일 때) */
  tabsToEscape?: number
  /** 포커스가 도착한 모달 밖 요소. body 이면 문서 처음/브라우저 UI 로 나간 것 */
  escapedTo?: NodeSnapshot
}

/**
 * 스캔 전에 페이지 상태를 만드는 시나리오. 데이터가 있어야 그려지는 화면과 클릭해야 열리는 UI(드롭다운, 모달)를
 * 스캔하는 데 쓰며, 같은 JSON 을 대시보드, CLI, MCP, 패치 후 재측정이 모두 재사용한다.
 * 비밀번호나 토큰은 넣지 않는다(대시보드 저장소에 평문으로 저장된다).
 */
export interface ScenarioSeed {
  /** 값이 문자열이면 그대로, 그 밖의 값(객체, 배열, 숫자)은 JSON 문자열로 넣는다 */
  localStorage?: Record<string, unknown>
  sessionStorage?: Record<string, unknown>
  /** 스캔하는 URL 의 호스트에만 설정된다 */
  cookies?: Array<{ name: string; value: string; path?: string }>
}

export type ScenarioStep =
  | { action: 'click'; selector: string }
  /** 마우스를 올린다. 툴팁처럼 hover 해야 나타나는 UI 를 연다 */
  | { action: 'hover'; selector: string }
  | { action: 'fill'; selector: string; value: string }
  /** ms 만큼 기다리거나, selector 가 화면에 나타날 때까지 기다린다 (둘 중 하나) */
  | { action: 'wait'; ms?: number; selector?: string }

/** 스캔에 쓸 수 있는 장치 프로필(화면 크기, 화면 배율, 터치 여부를 함께 바꾼다). 이름은 verifier 가 Playwright 장치 목록에 매핑한다 */
export const DEVICE_PROFILES = ['iphone-se', 'iphone', 'pixel', 'galaxy', 'ipad'] as const
export type DeviceProfile = (typeof DEVICE_PROFILES)[number]

/**
 * 같은 규칙을 다른 환경에서 다시 돌려 "그 환경에서만 생기는 결함"을 찾는다.
 * 스캔과 패치 후 재측정이 같은 환경을 만들 수 있도록 시나리오에 함께 저장한다.
 */
export interface ScenarioEnvironment {
  /** 다크 모드(prefers-color-scheme: dark)로 연다 */
  colorScheme?: 'dark'
  /** 윈도우 고대비 모드(forced-colors: active)로 연다. 색·그림자에만 의존한 표시가 사라지는지 본다 */
  forcedColors?: boolean
  /** 글자 크기만 이 배수로 키운다(1.25~3). 줄 높이 px 와 고정 크기 상자는 그대로라 잘림·겹침이 드러난다 */
  textScale?: number
  /** 모든 글을 1.5배 길이로 늘린다(번역, 긴 이름) */
  longText?: boolean
  /** 문서 방향을 오른쪽→왼쪽으로 바꾼다 */
  direction?: 'rtl'
  /** 장치 프로필로 연다. 화면 크기, 배율(흐릿한 이미지), 터치(터치 타겟)가 그 장치를 따른다 */
  device?: DeviceProfile
  /** Chromium 이 아닌 엔진으로 연다(그 엔진 설치 필요) */
  engine?: 'firefox' | 'webkit'
}

export interface Scenario {
  name?: string
  description?: string
  seed?: ScenarioSeed
  /** 페이지를 열고 안정화한 뒤, 탐지 전에 순서대로 실행한다 */
  steps?: ScenarioStep[]
  /** 페이지를 열 환경. 있으면 시드·단계 없이도 시나리오가 된다 */
  environment?: ScenarioEnvironment
}

interface DefectBase {
  /** url + fingerprint 기반의 결정론적 id (재스캔 시 동일) */
  id: string
  /** 같은 결함을 패치 전후에 대조하기 위한 키: 종류 | 소스 위치(또는 셀렉터) | 뷰포트 너비 */
  fingerprint: string
  severity: Severity
  url: string
  viewport: Viewport
  node: NodeSnapshot
  parent: NodeSnapshot
  suggestions: FixSuggestion[]
  detectedAt: string
  /** 시나리오로 스캔한 결함이면 그 시나리오의 키. id 에도 반영되어 같은 URL 의 일반 스캔과 섞이지 않는다 */
  scenarioKey?: string
}

export interface OverflowDefect extends DefectBase {
  kind: 'overflow-x'
  metrics: OverflowMetrics
}

export interface VerticalOverflowDefect extends DefectBase {
  kind: 'overflow-y'
  metrics: VerticalOverflowMetrics
}

export interface ClippedTextDefect extends DefectBase {
  kind: 'clipped-text'
  metrics: ClippedTextMetrics
}

export interface OcclusionDefect extends DefectBase {
  kind: 'occluded'
  metrics: OcclusionMetrics
}

export interface FocusDefect extends DefectBase {
  kind: 'focus-escape'
  metrics: FocusMetrics
}

/** kind 로 좁힐 수 있는 합집합. 소비처는 defect.kind 로 분기한다 */
export type Defect = OverflowDefect | VerticalOverflowDefect | ClippedTextDefect | OcclusionDefect | FocusDefect

export interface ScanResult {
  /** 시나리오로 스캔했다면 그 키 (결함의 scenarioKey 와 같다) */
  scenarioKey?: string
  /** 자동 탐색이 만든 시나리오. 대시보드가 보관해 패치 후 재측정에 같은 상태를 만든다 */
  scenario?: Scenario
  url: string
  viewport: Viewport
  /** document 전체 가로 스크롤 양 (html.scrollWidth - clientWidth) */
  documentOverflowPx: number
  defects: Defect[]
  stats: {
    scannedNodes: number
    durationMs: number
  }
}

export interface DetectOptions {
  /** 이 값(px) 이하의 오버플로우는 무시한다. 기본 1 */
  thresholdPx?: number
  /** 최대 보고 결함 수. 기본 50 */
  maxDefects?: number
  /** 소스 위치 속성 이름. 기본 data-ia-src */
  sourceAttribute?: string
  /** 표본점 중 이 비율 이상 가려져야 가려짐 결함으로 본다. 기본 0.6. 검증기가 "완전히 사라졌는가"를 볼 때 낮춘다 */
  minCoveredRatio?: number
}

/** 에이전트가 제안하는 검색/치환 방식의 편집 단위 */
export interface PatchEdit {
  /** 파일 안에서 정확히 한 번 등장해야 하는 원문 */
  oldText: string
  newText: string
}

/** 모달 하나의 포커스 탐침 정보. 키 입력은 Playwright 가 하고, 페이지 안에서는 상태만 조회한다 */
export interface ModalProbe {
  index: number
  trigger: ModalTrigger
  focusableCount: number
  node: NodeSnapshot
  parent: NodeSnapshot
}

export interface FocusState {
  /** 현재 포커스가 모달 안에 있는가 (body 는 밖으로 본다) */
  inside: boolean
  active?: NodeSnapshot
}

/** IIFE 탐지기 번들이 노출하는 전역 API */
export interface InspectorAgentGlobal {
  detect: (options?: DetectOptions) => ScanResult
  /** 열려 있는 모달을 찾아 이후 focusFirstInModal/modalFocusState 에서 index 로 가리킨다 */
  findModals: (options?: Pick<DetectOptions, 'sourceAttribute'>) => ModalProbe[]
  focusFirstInModal: (index: number) => boolean
  modalFocusState: (index: number, options?: Pick<DetectOptions, 'sourceAttribute'>) => FocusState
  /** Tab 탐침: begin → (Tab 을 누를 때마다 record) → finish 로 포커스 표시·가림·순서 결함을 받는다. 키 입력은 verifier 가 한다 */
  beginTabProbe: () => void
  /** 시나리오 환경 중 페이지 안에서 적용하는 것(글자 확대, 긴 글, RTL)을 적용한다. 색상 모드·장치·엔진은 verifier 가 브라우저 컨텍스트로 만든다 */
  applyEnvironment: (environment: ScenarioEnvironment) => void
  recordTabStop: () => { done: boolean }
  finishTabProbe: (options?: Pick<DetectOptions, 'sourceAttribute'>) => OverflowDefect[]
  version: string
}

declare global {
  interface Window {
    __INSPECTOR_AGENT__?: InspectorAgentGlobal
  }
}
