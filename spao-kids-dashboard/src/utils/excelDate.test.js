import { describe, it, expect } from 'vitest'
import { excelSerialToDateStr } from './excelDate'

describe('excelSerialToDateStr', () => {
  it('이미 YYYY-MM-DD 문자열이면 그대로(날짜 부분만) 반환한다', () => {
    expect(excelSerialToDateStr('2025-12-15 17:22:23')).toBe('2025-12-15')
  })

  it('Excel 날짜 직렬번호를 YYYY-MM-DD로 변환한다', () => {
    // 실제 '공홈 당일' 시트에서 관찰한 값 — 같은 행의 MM-DD 헬퍼 컬럼이 '03-25'였고
    // 해당 워크북 기준연도가 2026이므로 2026-03-25가 정답이어야 한다.
    expect(excelSerialToDateStr(46106.0005787037)).toBe('2026-03-25')
  })

  it('숫자도 문자열도 아니면 빈 문자열을 반환한다', () => {
    expect(excelSerialToDateStr(undefined)).toBe('')
    expect(excelSerialToDateStr('')).toBe('')
  })
})
