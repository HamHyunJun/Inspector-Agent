import vue from '@vitejs/plugin-vue'
import inspectorAgent from '@inspector-agent/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  // inspectorAgent 는 enforce: 'pre' 로 vue 플러그인보다 먼저 원본 SFC 에 소스 위치를 주입한다
  plugins: [inspectorAgent(), vue()]
})
