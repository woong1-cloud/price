import { describe, it, expect } from 'vitest'
import { filterPayloadByGender, filterItemsByGender } from './kidsFilter'

// 스타일코드 8번째 문자(인덱스 7)가 성별코드. K=키즈, G=여성.
const KID_CODE   = 'SPPPG25KU1' // [7]='K'
const ADULT_CODE = 'SPRWG25G01' // [7]='G'

describe('filterItemsByGender', () => {
  it('성별코드가 일치하는 상품만 남긴다', () => {
    const items = [{ styleCode: KID_CODE, realAmt: 100 }, { styleCode: ADULT_CODE, realAmt: 200 }]
    const out = filterItemsByGender(items, 'K')
    expect(out).toHaveLength(1)
    expect(out[0].styleCode).toBe(KID_CODE)
  })
})

describe('filterPayloadByGender', () => {
  const payload = {
    sales: {
      items: [
        { styleCode: KID_CODE, qty: 2, realAmt: 1000, pv: 5 },
        { styleCode: ADULT_CODE, qty: 3, realAmt: 3000, pv: 7 },
      ],
      sigma: { qty: 5, realAmt: 4000, pv: 12 },
    },
    cart: {
      items: [{ styleCode: KID_CODE, cartCnt: 4, orderCnt: 1, realAmt: 1000, memberCartCnt: 3, nonMemberCartCnt: 1 }],
      sigma: { cartCnt: 4, orderCnt: 1, realAmt: 1000, memberCartCnt: 3, nonMemberCartCnt: 1 },
    },
    wishlist: { items: [], sigma: { wishCnt: 0, orderCnt: 0, realAmt: 0 } },
    restock: {
      items: [{ productNo: 'P1', optionNo: 'O1', styleCode: KID_CODE, cnt: 3 }, { productNo: 'P2', optionNo: 'O2', styleCode: ADULT_CODE, cnt: 9 }],
      totalCnt: 12, productCount: 2, skuCount: 2,
    },
    customer:    { items: [{ gender: '여성', realAmt: 5000 }], sigma: {} },
    salesByDate: { items: [{ date: '2026-07-01', media: 'MOBILE', realAmt: 5000 }], sigma: {} },
    visit:       { items: [{ date: '2026-07-01', media: 'MOBILE', uv: 10 }] },
  }

  it('sales/cart/wishlist/restock 은 필터 후 sigma를 재계산한다', () => {
    const out = filterPayloadByGender(payload, 'K')
    expect(out.sales.items).toHaveLength(1)
    expect(out.sales.sigma).toEqual({ qty: 2, realAmt: 1000, pv: 5 })
    expect(out.cart.items).toHaveLength(1)
    expect(out.restock.items).toHaveLength(1)
    expect(out.restock.totalCnt).toBe(3)
    expect(out.restock.productCount).toBe(1)
    expect(out.restock.skuCount).toBe(1)
  })

  it('styleCode가 없는 데이터셋은 null 처리한다(성인+키즈 합산값 오표시 방지)', () => {
    const out = filterPayloadByGender(payload, 'K')
    expect(out.customer).toBeNull()
    expect(out.salesByDate).toBeNull()
    expect(out.visit).toBeNull()
  })

  it('payload가 없으면 그대로 반환한다', () => {
    expect(filterPayloadByGender(null, 'K')).toBeNull()
  })
})
