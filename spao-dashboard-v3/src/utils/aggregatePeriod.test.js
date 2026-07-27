import { describe, it, expect } from 'vitest'
import {
  mergePayloads, monthKeyOf, quarterKeyOf, listPeriods, weekKeysInPeriod, previousPeriodKey, periodLabel,
} from './aggregatePeriod'

describe('mergePayloads', () => {
  it('흐름 데이터셋은 items 이어붙이고 sigma 합산', () => {
    const w1 = { sales: { items: [{ realAmt: 100 }], sigma: { realAmt: 100, qty: 1 } } }
    const w2 = { sales: { items: [{ realAmt: 200 }, { realAmt: 50 }], sigma: { realAmt: 250, qty: 3 } } }
    const m = mergePayloads([w1, w2])
    expect(m.sales.items).toHaveLength(3)
    expect(m.sales.sigma.realAmt).toBe(350)
    expect(m.sales.sigma.qty).toBe(4)
  })

  it('restock 는 합산하지 않고 최신(마지막) 주 값만 사용', () => {
    const w1 = { restock: { items: [{ cnt: 10 }], totalCnt: 10 } }
    const w2 = { restock: { items: [{ cnt: 5 }, { cnt: 3 }], totalCnt: 8 } }
    const m = mergePayloads([w1, w2])
    expect(m.restock.totalCnt).toBe(8)        // 최신 주 값
    expect(m.restock.items).toHaveLength(2)    // 합산 아님
  })

  it('일부 주에만 있는 데이터셋도 안전하게 합친다', () => {
    const w1 = { sales: { items: [{ realAmt: 1 }] } }
    const w2 = { coupon: { items: [{ realAmt: 2 }], sigma: { realAmt: 2 } } }
    const m = mergePayloads([w1, w2])
    expect(m.sales.items).toHaveLength(1)
    expect(m.coupon.items).toHaveLength(1)
  })

  it('payload 1개면 그대로 반환', () => {
    const w1 = { sales: { items: [{ realAmt: 1 }] } }
    expect(mergePayloads([w1])).toBe(w1)
    expect(mergePayloads([])).toBeNull()
  })
})

describe('기간 키/목록', () => {
  const index = [
    { week_key: '2026-W23', week_start: '2026-06-01' },
    { week_key: '2026-W24', week_start: '2026-06-08' },
    { week_key: '2026-W22', week_start: '2026-05-25' },
    { week_key: '2026-W18', week_start: '2026-04-27' },
  ]

  it('monthKeyOf / quarterKeyOf', () => {
    expect(monthKeyOf('2026-06-01')).toBe('2026-06')
    expect(quarterKeyOf('2026-06-01')).toBe('2026-Q2')
    expect(quarterKeyOf('2026-04-27')).toBe('2026-Q2')
    expect(quarterKeyOf('2026-01-05')).toBe('2026-Q1')
  })

  it('listPeriods(월) — 최신 desc, 주차 묶음', () => {
    const months = listPeriods(index, 'month')
    expect(months.map(m => m.key)).toEqual(['2026-06', '2026-05', '2026-04'])
    expect(months[0].weeks.sort()).toEqual(['2026-W23', '2026-W24'])
  })

  it('weekKeysInPeriod(월) — 해당 월 주차만, 주 시작 오름차순', () => {
    expect(weekKeysInPeriod(index, 'month', '2026-06')).toEqual(['2026-W23', '2026-W24'])
    expect(weekKeysInPeriod(index, 'month', '2026-05')).toEqual(['2026-W22'])
  })

  it('previousPeriodKey — 직전 기간', () => {
    expect(previousPeriodKey(index, 'month', '2026-06')).toBe('2026-05')
    expect(previousPeriodKey(index, 'month', '2026-04')).toBeNull() // 가장 오래된 달
  })

  it('분기 묶음', () => {
    const q = listPeriods(index, 'quarter')
    expect(q.map(x => x.key)).toEqual(['2026-Q2'])
    expect(weekKeysInPeriod(index, 'quarter', '2026-Q2').length).toBe(4)
  })

  it('periodLabel', () => {
    expect(periodLabel('2026-06', 'month')).toBe('2026년 6월')
    expect(periodLabel('2026-Q2', 'quarter')).toBe('2026 Q2')
  })
})
