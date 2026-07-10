// rows: aggregateChannelDaily() 결과 배열
// supabaseClient: @supabase/supabase-js 클라이언트(테스트에서는 모의 객체 주입)
const SOURCE_BY_CHANNEL = { '자사몰': 'gonghom_upload', '이랜드몰': 'eland_upload', '네이버': 'naver_upload' }

export async function uploadKidsChannelDaily(supabaseClient, rows) {
  if (!rows || rows.length === 0) return { ok: true, upserted: 0 }

  const payload = rows.map(r => ({
    stat_date: r.date,
    channel: r.channel,
    order_cnt: r.orderCnt,
    order_amt: r.orderAmt,
    real_order_cnt: r.realOrderCnt,
    real_amt: r.realAmt,
    cancel_amt: r.cancelAmt,
    discount_amt: r.discountAmt,
    _source: SOURCE_BY_CHANNEL[r.channel] ?? null,
  }))

  const { error, count } = await supabaseClient
    .from('kids_channel_daily')
    .upsert(payload, { onConflict: 'stat_date,channel', count: 'exact' })

  if (error) return { ok: false, error: error.message }
  return { ok: true, upserted: count ?? payload.length }
}
