/**
 * chrome.debugger 로 탭의 뷰포트 폭을 바꿔 검사하는 로직. chrome API 를 직접 부르지 않고 필요한 부분만
 * 주입받아서, 확장 밖(단위 테스트)에서도 호출 순서와 정리(원복, 디버거 해제)를 검증할 수 있다.
 */

export interface DebuggerApi {
  attach: (target: { tabId: number }, requiredVersion: string) => Promise<void>
  sendCommand: (target: { tabId: number }, method: string, params?: Record<string, unknown>) => Promise<unknown>
  detach: (target: { tabId: number }) => Promise<void>
}

export interface EmulatedViewport {
  width: number
  height: number
}

export const MIN_EMULATED_WIDTH = 240
export const MAX_EMULATED_WIDTH = 3840

/** 높이는 스캔 결과(폭 기준 탐지)에 영향이 없으므로 모바일 화면 비율의 흔한 값을 쓴다 */
export const viewportForWidth = (width: number): EmulatedViewport => {
  if (!Number.isInteger(width) || width < MIN_EMULATED_WIDTH || width > MAX_EMULATED_WIDTH) {
    throw new Error(`에뮬레이션 폭은 ${MIN_EMULATED_WIDTH}~${MAX_EMULATED_WIDTH} 사이의 정수여야 합니다 (받은 값: ${width})`)
  }
  return { width, height: 812 }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done): void => {
    setTimeout(done, ms)
  })

/**
 * 디버거를 붙여 뷰포트를 바꾼 상태에서 task 를 실행하고, 성공하든 실패하든 에뮬레이션을 원복하고 디버거를 뗀다.
 * 원복 명령이 실패해도 detach 는 반드시 시도한다(디버거가 붙은 채 남으면 탭에 안내줄이 계속 보인다).
 * 디버거를 붙이지 못하면(DevTools 가 이미 붙어 있는 탭 등) 아무것도 바꾸지 않고 오류를 그대로 던진다.
 */
export const withViewportEmulation = async <T>(
  api: DebuggerApi,
  tabId: number,
  viewport: EmulatedViewport,
  task: () => Promise<T>,
  settleMs = 200
): Promise<T> => {
  const target = { tabId }
  await api.attach(target, '1.3')
  try {
    // deviceScaleFactor 0 은 기존 값을 유지한다. mobile 은 끄고 폭만 바꾼다
    await api.sendCommand(target, 'Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 0, mobile: false })
    // 리사이즈가 레이아웃에 반영될 시간을 준다
    await sleep(settleMs)
    return await task()
  } finally {
    try {
      await api.sendCommand(target, 'Emulation.clearDeviceMetricsOverride')
    } finally {
      await api.detach(target)
    }
  }
}
