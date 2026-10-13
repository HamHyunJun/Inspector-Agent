import { defineConfig } from 'vitest/config'

// E2E 는 실제 Chromium 에 확장을 로드하므로 기본 5초 제한으로는 부족하다
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 90_000 }
})
