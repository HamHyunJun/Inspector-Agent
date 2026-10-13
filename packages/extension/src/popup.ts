import type { ScanResult } from '@inspector-agent/core'
import { viewportForWidth, withViewportEmulation } from './emulation'
import type { DebuggerApi } from './emulation'

/**
 * 팝업: 활성 탭에 탐지기 번들을 주입해 실행하고, 결과를 대시보드 /api/scans 로 전송한다.
 * 확장 페이지는 host_permissions 덕분에 localhost 대시보드에 CORS 제약 없이 요청할 수 있다.
 */

const STORAGE_KEY = 'dashboardUrl'

const form = document.querySelector<HTMLFormElement>('#scan-form')
const urlInput = document.querySelector<HTMLInputElement>('#dashboard-url')
const emulateCheckbox = document.querySelector<HTMLInputElement>('#emulate')
const emulateWidthInput = document.querySelector<HTMLInputElement>('#emulate-width')
const statusText = document.querySelector<HTMLParagraphElement>('#status')
const defectList = document.querySelector<HTMLUListElement>('#defects')

const setStatus = (message: string): void => {
  if (statusText) statusText.textContent = message
}

const renderDefects = (result: ScanResult): void => {
  if (!defectList) return
  defectList.replaceChildren(
    ...result.defects.map((defect): HTMLLIElement => {
      const item = document.createElement('li')
      const source = defect.node.source ? `${defect.node.source.file}:${defect.node.source.line}` : defect.node.selector
      const size =
        defect.kind === 'occluded'
          ? `가려짐 ${Math.round(defect.metrics.coveredRatio * 100)}%`
          : defect.kind === 'focus-escape'
            ? '모달 포커스 이탈'
            : `+${Math.round(defect.metrics.overflowPx)}px`
      item.textContent = `[${defect.severity}] ${source} ${size}`
      return item
    })
  )
}

const runDetector = async (tabId: number): Promise<ScanResult> => {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['detector.global.js'] })
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (): ScanResult | undefined => window.__INSPECTOR_AGENT__?.detect()
  })
  const result = injection?.result as ScanResult | undefined
  if (!result) throw new Error('탐지기를 실행하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.')
  return result
}

const debuggerApi: DebuggerApi = {
  attach: (target, version) => chrome.debugger.attach(target, version),
  sendCommand: async (target, method, params) => chrome.debugger.sendCommand(target, method, params),
  detach: (target) => chrome.debugger.detach(target)
}

/**
 * 스캔 대상 탭. 기본은 활성 탭이다. 팝업 페이지를 탭으로 열어 쓰는 경우(E2E 테스트 등)에는
 * 활성 탭이 팝업 자신이 되므로 popup.html?tabId=<번호> 로 대상 탭을 지정한다.
 */
const resolveTargetTabId = async (): Promise<number> => {
  const requested = Number(new URLSearchParams(window.location.search).get('tabId'))
  if (Number.isInteger(requested) && requested > 0) return requested
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) throw new Error('활성 탭을 찾을 수 없습니다.')
  return tab.id
}

const handleSubmit = async (event: SubmitEvent): Promise<void> => {
  event.preventDefault()
  const dashboardUrl = urlInput?.value ?? ''
  await chrome.storage.local.set({ [STORAGE_KEY]: dashboardUrl })
  setStatus('탐지 중…')
  try {
    const tabId = await resolveTargetTabId()
    const emulate = emulateCheckbox?.checked ?? false
    const result = emulate
      ? await withViewportEmulation(debuggerApi, tabId, viewportForWidth(Number(emulateWidthInput?.value)), (): Promise<ScanResult> => runDetector(tabId))
      : await runDetector(tabId)
    renderDefects(result)
    const response = await fetch(new URL('/api/scans', dashboardUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ results: [result] })
    })
    if (!response.ok) throw new Error(`대시보드 응답 ${response.status}`)
    setStatus(`${result.viewport.width}px 뷰포트${emulate ? '(에뮬레이션)' : ''}에서 결함 ${result.defects.length}건을 대시보드로 보냈습니다.`)
  } catch (error) {
    setStatus(`실패: ${(error as Error).message}`)
  }
}

const restoreDashboardUrl = async (): Promise<void> => {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const value = stored[STORAGE_KEY]
  if (urlInput && typeof value === 'string') urlInput.value = value
}

form?.addEventListener('submit', (event): void => {
  void handleSubmit(event)
})
void restoreDashboardUrl()
