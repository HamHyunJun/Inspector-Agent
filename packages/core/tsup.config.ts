import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true
  },
  {
    // 브라우저(확장 content script, Playwright addScriptTag)에 주입되는 IIFE 번들
    entry: { detector: 'src/browser.ts' },
    format: ['iife'],
    globalName: '__INSPECTOR_AGENT_BUNDLE__',
    minify: true,
    platform: 'browser'
  }
])
