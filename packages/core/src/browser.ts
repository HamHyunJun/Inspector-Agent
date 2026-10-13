import { detect } from './detector'

/**
 * IIFE 번들 진입점. 확장 content script와 Playwright 검증기가 같은 탐지 코드를 쓰도록
 * window.__INSPECTOR_AGENT__ 에 노출한다. (전역 타입은 types.ts 에 선언)
 */
window.__INSPECTOR_AGENT__ = { detect, version: '0.1.0' }
