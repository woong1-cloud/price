import { describe, it, expect } from 'vitest'
import { previousWeekKey, mostRecentWeekKey } from './weekNav'

const idx = [
  { week_key: '2026-W23', week_start: '2026-06-01' }, // 6월 1주
  { week_key: '2026-W22', week_start: '2026-05-25' }, // 5월 4주
  { week_key: '2026-W21', week_start: '2026-05-18' }, // 5월 3주
]

describe('previousWeekKey', () => {
  it('returns the chronologically preceding snapshot', () => {
    expect(previousWeekKey(idx, '2026-W23')).toBe('2026-W22')
    expect(previousWeekKey(idx, '2026-W22')).toBe('2026-W21')
  })
  it('returns null for the oldest week', () => {
    expect(previousWeekKey(idx, '2026-W21')).toBeNull()
  })
  it('returns null when weekKey not in index', () => {
    expect(previousWeekKey(idx, '2099-W01')).toBeNull()
  })
  it('is independent of array order', () => {
    const shuffled = [idx[2], idx[0], idx[1]]
    expect(previousWeekKey(shuffled, '2026-W23')).toBe('2026-W22')
  })
  it('falls back to week_key when week_start is missing', () => {
    const noStart = [
      { week_key: '2026-W23', week_start: null },
      { week_key: '2026-W22', week_start: null },
    ]
    expect(previousWeekKey(noStart, '2026-W23')).toBe('2026-W22')
  })
})

describe('mostRecentWeekKey', () => {
  it('returns the newest week by start date', () => {
    expect(mostRecentWeekKey(idx)).toBe('2026-W23')
    expect(mostRecentWeekKey([idx[1], idx[2]])).toBe('2026-W22')
  })
  it('returns null for empty index', () => {
    expect(mostRecentWeekKey([])).toBeNull()
  })
})
