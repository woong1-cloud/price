import { defineConfig } from 'vitest/config'

// 유닛 테스트는 순수 유틸 함수만 대상으로 한다(노드 환경, jsdom 불필요).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/**/*.test.js'],
  },
})
