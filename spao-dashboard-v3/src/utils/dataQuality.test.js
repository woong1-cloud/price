import { describe, it, expect } from 'vitest'
import { checkDataQuality } from './dataQuality'

// 정상 기준 데이터 (어떤 경고도 트리거되지 않아야 함)
const cleanDerived = {
  kpis: [
    { id: 'revenue', rawValue: 470_000_000 },
    { id: 'custCnt', rawValue: 8600 },
  ],
  genderData: [
    { name: '여', value: 300_000_000 },
    { name: '남', value: 150_000_000 },
  ],
  cartDerived: { cartCnt: 5000, orderCnt: 3000 },
}
const cleanSales = {
  sigma: { realAmt: 471_000_000, orderCnt: 3000, realOrderCnt: 2800, buyerCnt: 8585 },
  cancelRate: 6.7,
  discountRate: 22.0,
  dailyOrders: [1, 2, 3, 4, 5, 6, 7], // 7일치
}
const cleanSearch = {
  sigma: { searchVol: 10000 },
  dailySearch: [1, 2, 3, 4, 5, 6, 7], // 7일치
}

describe('checkDataQuality', () => {
  it('정상 데이터는 경고가 없다', () => {
    const w = checkDataQuality({ derived: cleanDerived, salesByDate: cleanSales, search: cleanSearch })
    expect(w).toEqual([])
  })

  it('규칙1: 고객 세그먼트 매출 합계가 주문 매출보다 크면 경고', () => {
    const derived = { ...cleanDerived, genderData: [{ name: '여', value: 1_090_000_000 }] }
    const w = checkDataQuality({ derived, salesByDate: cleanSales, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('customer-amt-exceeds-revenue')
  })

  it('규칙1: 매출과 비슷한 수준(±10% 이내)이면 경고 없음', () => {
    const derived = { ...cleanDerived, genderData: [{ name: '여', value: 490_000_000 }] }
    const w = checkDataQuality({ derived, salesByDate: cleanSales, search: cleanSearch })
    expect(w.map(x => x.id)).not.toContain('customer-amt-exceeds-revenue')
  })

  it('규칙2: 검색 일자가 주문 일자보다 적으면 경고', () => {
    const search = { ...cleanSearch, dailySearch: [1] } // 하루치만
    const w = checkDataQuality({ derived: cleanDerived, salesByDate: cleanSales, search })
    expect(w.map(x => x.id)).toContain('search-days-short')
  })

  it('규칙3: 주문 일자가 7일 미만이면 경고', () => {
    const salesByDate = { ...cleanSales, dailyOrders: [1, 2, 3, 4, 5] } // 5일치
    const w = checkDataQuality({ derived: cleanDerived, salesByDate, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('sales-days-short')
  })

  it('규칙4: 상품 매출과 기간별 매출 합계가 20% 넘게 차이나면 경고', () => {
    const salesByDate = { ...cleanSales, sigma: { ...cleanSales.sigma, realAmt: 100_000_000 } }
    const w = checkDataQuality({ derived: cleanDerived, salesByDate, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('revenue-file-mismatch')
  })

  it('규칙5: 주문 건수가 장바구니 담기보다 많으면 경고', () => {
    const derived = { ...cleanDerived, cartDerived: { cartCnt: 1000, orderCnt: 2000 } }
    const w = checkDataQuality({ derived, salesByDate: cleanSales, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('funnel-order-exceeds-cart')
  })

  it('규칙5: 결제 완료가 주문 건수보다 많으면 경고', () => {
    const salesByDate = { ...cleanSales, sigma: { ...cleanSales.sigma, orderCnt: 1000, realOrderCnt: 1500 } }
    const w = checkDataQuality({ derived: cleanDerived, salesByDate, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('funnel-realorder-exceeds-order')
  })

  it('규칙6: 취소율이 0~100% 범위를 벗어나면 경고', () => {
    const salesByDate = { ...cleanSales, cancelRate: 120 }
    const w = checkDataQuality({ derived: cleanDerived, salesByDate, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('rate-cancel')
  })

  it('규칙7: 구매 고객수가 파일마다 30% 넘게 차이나면 경고', () => {
    const derived = { ...cleanDerived, kpis: [{ id: 'revenue', rawValue: 470_000_000 }, { id: 'custCnt', rawValue: 18_930 }] }
    const w = checkDataQuality({ derived, salesByDate: cleanSales, search: cleanSearch })
    expect(w.map(x => x.id)).toContain('buyer-count-mismatch')
  })

  it('규칙7: 구매 고객수가 비슷하면 경고 없음', () => {
    const w = checkDataQuality({ derived: cleanDerived, salesByDate: cleanSales, search: cleanSearch })
    expect(w.map(x => x.id)).not.toContain('buyer-count-mismatch')
  })

  it('데이터가 없으면 빈 배열', () => {
    expect(checkDataQuality({})).toEqual([])
    expect(checkDataQuality({ derived: null })).toEqual([])
  })

  it('검색 데이터가 아예 없으면 검색 일자 경고는 띄우지 않는다', () => {
    const w = checkDataQuality({ derived: cleanDerived, salesByDate: cleanSales, search: null })
    expect(w.map(x => x.id)).not.toContain('search-days-short')
  })
})
