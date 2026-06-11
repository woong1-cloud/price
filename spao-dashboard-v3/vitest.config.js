import { defineConfig } from 'vitest/config'

// 테스트 러너는 순수 유틸 함수에만 적용한다(노드 환경, jsdom 불필요).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/**/*.test.js'],
  },
})
