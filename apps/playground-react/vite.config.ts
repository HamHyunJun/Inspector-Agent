import inspectorAgent from '@inspector-agent/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // inspectorAgent 는 enforce: 'pre' 로 react 플러그인보다 먼저 원본 JSX 에 소스 위치를 주입한다
  plugins: [inspectorAgent(), react()]
})
