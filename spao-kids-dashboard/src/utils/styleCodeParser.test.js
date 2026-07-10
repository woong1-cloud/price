import { describe, it, expect } from 'vitest'
import { parseStyleCode } from './styleCodeParser'

describe('parseStyleCode', () => {
  it('8번째 문자(성별코드)가 K이면 키즈로 분류한다', () => {
    const parsed = parseStyleCode('SPPPF4VKU2')
    expect(parsed.genderCode).toBe('K')
    expect(parsed.gender).toBe('키즈')
  })

  it('8자 미만이면 안전한 기본값을 반환한다', () => {
    const parsed = parseStyleCode('SP')
    expect(parsed.gender).toBe('기타')
    expect(parsed.genderCode).toBe('')
  })
})
