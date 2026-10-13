// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/styles/global.scss'],
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Inspector-Agent'
    }
  },
  runtimeConfig: {
    // 패치를 반영할 대상 프로젝트 루트 (NUXT_PROJECT_ROOT 또는 INSPECTOR_PROJECT_ROOT 로 지정)
    projectRoot: process.env.INSPECTOR_PROJECT_ROOT ?? '../playground',
    // 결함/패치 저장소와 백업 위치
    dataDir: process.env.INSPECTOR_DATA_DIR ?? '.inspector-agent',
    // 파일 반영 후 HMR 이 끝나길 기다리는 시간(ms)
    settleMs: Number(process.env.INSPECTOR_SETTLE_MS ?? 800),
    chromiumPath: process.env.INSPECTOR_CHROMIUM_PATH ?? ''
  },
  routeRules: {
    // Chrome 확장 popup 에서 직접 호출할 수 있도록 API 에 CORS 허용
    '/api/**': { cors: true }
  },
  nitro: {
    externals: {
      external: ['playwright-core']
    }
  },
  typescript: {
    strict: true
  }
})
