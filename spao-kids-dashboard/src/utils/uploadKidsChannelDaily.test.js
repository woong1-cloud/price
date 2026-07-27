import { describe, it, expect, vi } from 'vitest'
import { uploadKidsChannelDaily } from './uploadKidsChannelDaily'

function makeMockClient({ error = null, count = 2 } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error, count })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from }, upsert, from }
}

describe('uploadKidsChannelDaily', () => {
  it('집계 행을 kids_channel_daily 스키마로 변환해 upsert한다', async () => {
    const { client, from, upsert } = makeMockClient()
    const rows = [
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
    ]
    const result = await uploadKidsChannelDaily(client, rows)

    expect(from).toHaveBeenCalledWith('kids_channel_daily')
    expect(upsert).toHaveBeenCalledWith(
      [{
        stat_date: '2026-07-01', channel: '이랜드몰',
        order_cnt: 2, order_amt: 69800, real_order_cnt: 1, real_amt: 39900,
        cancel_amt: 29900, discount_amt: null, _source: 'eland_upload',
      }],
      { onConflict: 'stat_date,channel', count: 'exact' },
    )
    expect(result).toEqual({ ok: true, upserted: 2 })
  })

  it('행이 없으면 업서트 없이 성공을 반환한다', async () => {
    const { client, upsert } = makeMockClient()
    const result = await uploadKidsChannelDaily(client, [])
    expect(upsert).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, upserted: 0 })
  })

  it('Supabase 에러를 그대로 전달한다', async () => {
    const { client } = makeMockClient({ error: { message: 'boom' } })
    const result = await uploadKidsChannelDaily(client, [
      { date: '2026-07-01', channel: '자사몰', discountAmt: null, orderCnt: 1, orderAmt: 1, realOrderCnt: 1, realAmt: 1, cancelAmt: 0 },
    ])
    expect(result).toEqual({ ok: false, error: 'boom' })
  })

  it('count가 null이면 payload 길이로 대체한다', async () => {
    const { client } = makeMockClient({ count: null })
    const rows = [
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 1, realOrderCnt: 1, realAmt: 1, cancelAmt: 0 },
      { date: '2026-07-02', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 1, realOrderCnt: 1, realAmt: 1, cancelAmt: 0 },
    ]
    const result = await uploadKidsChannelDaily(client, rows)
    expect(result).toEqual({ ok: true, upserted: 2 })
  })
})
