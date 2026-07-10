import { describe, it, expect } from 'vitest'
import { aggregateChannelDaily } from './aggregateChannelDaily'

const isCanceled = (item) => item.status === '취소완료'

describe('aggregateChannelDaily', () => {
  it('같은 날짜의 항목을 합산하고 취소 건은 cancelAmt로 분리한다', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 },
      { date: '2026-07-01', styleCode: 'SPPPE49KU1', status: '취소완료', qty: 1, amt: 29900 },
      { date: '2026-07-02', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 2, amt: 79800 },
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
      { date: '2026-07-02', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 79800, realOrderCnt: 2, realAmt: 79800, cancelAmt: 0 },
    ])
  })

  it('성별코드가 다른 상품은 걸러낸다(안전망)', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 }, // 키즈(K)
      { date: '2026-07-01', styleCode: 'SPRWG25G01', status: '결제완료', qty: 1, amt: 29900 }, // 여성(G)
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 39900, realOrderCnt: 1, realAmt: 39900, cancelAmt: 0 },
    ])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(aggregateChannelDaily([], { channel: '이랜드몰', isCanceled })).toEqual([])
  })
})
