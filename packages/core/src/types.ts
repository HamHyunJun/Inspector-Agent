/**
 * Inspector-Agent 전 구간(확장, 검증기, 대시보드, MCP)이 공유하는 데이터 계약.
 * 결함 페이로드는 "LLM에 보낼 최소 정보"를 기준으로 설계한다.
 */

/** 1차 범위: 가로 레이아웃 오버플로우 */
export type DefectKind = 'overflow-x'

/**
 * 오버플로우 발생 형태
 * - box: 요소의 박스 자체가 부모 콘텐츠 영역 밖으로 밀려남 (예: flex item min-width:auto)
 * - content: 요소 박스는 맞지만 내부 텍스트/인라인 콘텐츠가 박스를 넘침 (예: nowrap, 긴 URL)
 */
export type OverflowMode = 'box' | 'content'

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

export interface FixSuggestion {
  hint: FixHint
  /** 선언을 추가할 대상 */
  target: 'node' | 'parent'
  declarations: Record<string, string>
  reason: string
}

export interface OverflowMetrics {
  mode: OverflowMode
  /** 넘친 양(px). 패치 후 0이 되어야 한다 */
  overflowPx: number
  /** overflowPx / 부모 콘텐츠 너비 */
  overflowRatio: number
  parentContentWidth: number
  nodeWidth: number
}

export interface Defect {
  /** url + fingerprint 기반의 결정론적 id (재스캔 시 동일) */
  id: string
  /** 같은 결함을 패치 전후에 대조하기 위한 키: 종류 | 소스 위치(또는 셀렉터) | 뷰포트 너비 */
  fingerprint: string
  kind: DefectKind
  severity: Severity
  url: string
  viewport: Viewport
  node: NodeSnapshot
  parent: NodeSnapshot
  metrics: OverflowMetrics
  suggestions: FixSuggestion[]
  detectedAt: string
}

export interface ScanResult {
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
}

/** 에이전트가 제안하는 검색/치환 방식의 편집 단위 */
export interface PatchEdit {
  /** 파일 안에서 정확히 한 번 등장해야 하는 원문 */
  oldText: string
  newText: string
}

/** IIFE 탐지기 번들이 노출하는 전역 API */
export interface InspectorAgentGlobal {
  detect: (options?: DetectOptions) => ScanResult
  version: string
}

declare global {
  interface Window {
    __INSPECTOR_AGENT__?: InspectorAgentGlobal
  }
}
