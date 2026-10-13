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
    chromiumPath: process.env.INSPECTOR_CHROMIUM_PATH ?? '',
    // 로컬 주소 밖에서 대시보드를 열 때 허용할 호스트 이름(쉼표 구분). 확장 popup 은 host_permissions 로 호출하므로 CORS 는 열지 않는다
    allowedHosts: process.env.INSPECTOR_ALLOWED_HOSTS ?? ''
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
