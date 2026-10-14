import { defineConfig } from 'tsup'

// source-locator 는 배포하지 않는 내부 패키지라 번들에 포함한다. 그 의존성(compiler-sfc, postcss)은 이 패키지의 dependencies 에 있다
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  // 타입도 번들에 포함해 배포된 d.ts 가 배포되지 않는 패키지를 가리키지 않게 한다
  dts: { resolve: ['@inspector-agent/source-locator'] },
  clean: true,
  noExternal: ['@inspector-agent/source-locator']
})
