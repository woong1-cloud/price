import { describe, it, expect } from 'vitest'
import { parseCoupon } from './parseExcel'
import { computeCouponMetrics } from './metrics'

const HEADER = [
  'No.', '날짜', '프로모션번호', '프로모션명', '쿠폰구분', '프로모션종류그룹', '등록자ID', '승인자ID',
  '쿠폰발급수', '쿠폰사용수', '쿠폰취소수', '쿠폰순사용수', '주문금액', '실주문금액',
  '혜택금액', '혜택할인금액', '쿠폰할인금액(MD부담)', '쿠폰할인금액(마케팅부담)',
]
const SIGMA = ['Σ', '', '', '', '', '', '', '', 6000, 300, 0, 280, 30000000, 28000000, 3000000, 3000000, 2800000, 200000]
// 행: No,날짜,번호,명,구분,그룹,등록,승인, 발급,사용,취소,순사용, 주문,실주문, 혜택,혜택할인, MD부담,마케팅부담
function row(no, name, group, issued, used, realAmt, disc, md, mktg) {
  return [no, '2026-06-22', '260' + no, name, '쿠폰', group, 'kim', 'kim', issued, used, 0, used, realAmt, realAmt, disc, disc, md, mktg]
}

describe('parseCoupon', () => {
  it('헤더/행을 파싱하고 부담주체를 추출한다', () => {
    const out = parseCoupon([HEADER, SIGMA, row(1, '쿨페스타 10%', '장바구니쿠폰', 1000, 200, 20000000, 2000000, 2000000, 0)])
    expect(out.items).toHaveLength(1)
    const it0 = out.items[0]
    expect(it0.promoName).toBe('쿨페스타 10%')
    expect(it0.promoGroup).toBe('장바구니쿠폰')
    expect(it0.issued).toBe(1000)
    expect(it0.used).toBe(200)
    expect(it0.realAmt).toBe(20000000)
    expect(it0.burdenMD).toBe(2000000)
  })

  it('Σ 합계행과 빈 프로모션명 행은 제외한다', () => {
    const out = parseCoupon([HEADER, SIGMA, row(1, '쿠폰A', '장바구니쿠폰', 100, 10, 1000000, 100000, 100000, 0)])
    expect(out.items).toHaveLength(1) // Σ 제외
  })
})

describe('computeCouponMetrics', () => {
  const rows = [
    HEADER, SIGMA,
    row(1, '쿨페스타 10%', '장바구니쿠폰', 4000, 2000, 150000000, 15000000, 15000000, 0),
    row(2, '첫로그인 10%', '장바구니쿠폰', 1500, 1000, 100000000, 10000000, 8000000, 2000000),
    row(3, '오프라인 10%', '오프라인주문쿠폰', 5000, 0, 0, 0, 0, 0),
  ]

  it('요약·사용률·효율을 계산한다', () => {
    const m = computeCouponMetrics(parseCoupon(rows))
    expect(m.summary.issued).toBe(10500)
    expect(m.summary.used).toBe(3000)
    expect(m.summary.usageRate).toBeCloseTo(3000 / 10500 * 100)
    expect(m.summary.realAmt).toBe(250000000)
    expect(m.summary.discount).toBe(25000000)
    expect(m.summary.efficiency).toBeCloseTo(10) // 2.5억 / 0.25억
  })

  it('부담주체를 분할한다 (MD vs 마케팅)', () => {
    const m = computeCouponMetrics(parseCoupon(rows))
    expect(m.burden.MD).toBe(23000000)
    expect(m.burden.마케팅).toBe(2000000)
    expect(m.burdenList[0].name).toBe('MD') // 최대 부담
  })

  it('프로모션종류그룹별로 나눈다 (오프라인은 실주문 0)', () => {
    const m = computeCouponMetrics(parseCoupon(rows))
    const offline = m.byGroup.find(g => g.group === '오프라인주문쿠폰')
    expect(offline.realAmt).toBe(0)
    const cart = m.byGroup.find(g => g.group === '장바구니쿠폰')
    expect(cart.realAmt).toBe(250000000)
  })

  it('프로모션을 실주문 내림차순 정렬한다', () => {
    const m = computeCouponMetrics(parseCoupon(rows))
    expect(m.promos[0].promoName).toBe('쿨페스타 10%')
    expect(m.promos[0].realAmt).toBeGreaterThanOrEqual(m.promos[1].realAmt)
  })

  it('전주 대비(WoW)를 계산한다', () => {
    const cur = parseCoupon(rows)
    const prevRows = [HEADER, SIGMA, row(1, '쿨페스타 10%', '장바구니쿠폰', 2000, 1000, 100000000, 10000000, 10000000, 0)]
    const m = computeCouponMetrics(cur, parseCoupon(prevRows))
    expect(m.hasPrev).toBe(true)
    expect(m.wow.realAmt).toBeCloseTo((250000000 - 100000000) / 100000000 * 100)
  })

  it('데이터 없으면 null', () => {
    expect(computeCouponMetrics(null)).toBeNull()
    expect(computeCouponMetrics({ items: [] })).toBeNull()
  })
})
