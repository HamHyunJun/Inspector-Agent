import inspectorAgent from '@inspector-agent/vite-plugin'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  ssr: false,
  vite: { plugins: [inspectorAgent()] }
})
