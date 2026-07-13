// ════════════════════════════════════════════════════════════════════════
// need-ingest — N.E.E.D 수집 JSON을 받아 daily_* 스테이징 테이블에 upsert
// ────────────────────────────────────────────────────────────────────────
// 호출: POST /functions/v1/need-ingest
// 헤더: x-ingest-key: <Secrets 에 등록한 INGEST_KEY 와 동일한 값>
// 바디: 수집기가 만드는 JSON 봉투 그대로 { endpointId, mergedRows, ... }
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INGEST_KEY = Deno.env.get('INGEST_KEY')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── endpointId 별 라우팅 설정 ──────────────────────────────────────────────
// table: 저장할 daily_* 테이블
// keys : upsert 충돌 판정 기준 컬럼(자연키)
// dateFrom: 'row'(행 자체 필드) | 'queryEnd'(mergedRows 의 _query_end 사용)
// dateField: dateFrom='row' 일 때 사용할 행의 날짜 필드명
// map  : { 원본필드 → 저장컬럼 } (같으면 생략 가능, 아래는 명시적으로 나열)
// skip : 이 함수가 true 를 반환하면 그 행은 저장하지 않음(예: 전일 비교행 제외)
type EndpointConfig = {
  table: string
  keys: string[]
  dateFrom: 'row' | 'queryEnd'
  dateField?: string
  hourFromDate?: boolean // 날짜 문자열에 시(hour) 가 포함돼 있으면 분리 저장
  map: Record<string, string>
  skip?: (row: Record<string, unknown>) => boolean
}

const CONFIG: Record<string, EndpointConfig> = {
  salesDaily: {
    table: 'daily_sales_by_date',
    keys: ['stat_date', 'media'],
    dateFrom: 'row',
    dateField: 'ord_date',
    map: {
      media: 'media', ord_count: 'ord_count', ord_qty: 'ord_qty', ord_amount: 'ord_amount',
      ordpsn_count: 'ordpsn_count', realord_count: 'realord_count', realord_qty: 'realord_qty',
      realord_amount: 'realord_amount', real_sale_amount: 'real_sale_amount',
      cancel_takeback_qty: 'cancel_takeback_qty', cancel_takeback_amount: 'cancel_takeback_amount',
      benefit_dc_amount: 'benefit_dc_amount', all_benefit_amount: 'all_benefit_amount',
      benefit_saving_amount: 'benefit_saving_amount', shipcost_amount: 'shipcost_amount',
    },
  },
  itemAggrList: {
    table: 'daily_sales',
    keys: ['stat_date', 'media', 'item_no'],
    dateFrom: 'queryEnd',
    map: {
      media: 'media', item_no: 'item_no', model_no: 'model_no', item_name: 'item_name',
      itemview_count: 'itemview_count', cart_qty_sum: 'cart_qty_sum', conversion_rate: 'conversion_rate',
    },
  },
  cartItemList: {
    table: 'daily_cart',
    keys: ['stat_date', 'item_no', 'cart_uitem_no'],
    dateFrom: 'queryEnd',
    map: {
      item_no: 'item_no', cart_uitem_no: 'cart_uitem_no', uitem_name: 'uitem_name',
      item_name: 'item_name', model_no: 'model_no', cart_cnt: 'cart_cnt', cart_qty: 'cart_qty',
      member_cart_cnt: 'member_cart_cnt', member_cart_qty: 'member_cart_qty',
      nonmember_cart_cnt: 'nonmember_cart_cnt', nonmember_cart_qty: 'nonmember_cart_qty',
      completed_ord_qty: 'completed_ord_qty', giveup_cnt: 'giveup_cnt', giveup_rate: 'giveup_rate',
      sellprice: 'sellprice', occur_dt: 'occur_dt',
    },
  },
  wishItemList: {
    table: 'daily_wishlist',
    keys: ['stat_date', 'item_no'],
    dateFrom: 'queryEnd',
    map: { item_no: 'item_no', item_name: 'item_name', model_no: 'model_no', wish_cnt: 'wish_cnt', sellprice: 'sellprice' },
  },
  mbrSales: {
    table: 'daily_customer',
    keys: ['stat_date', 'gender_name', 'age_scope_name'],
    dateFrom: 'queryEnd',
    map: {
      gender_name: 'gender_name', age_scope_name: 'age_scope_name', mbr_count: 'mbr_count',
      new_mbr_count: 'new_mbr_count', first_ordpsn_count: 'first_ordpsn_count', ordpsn_count: 'ordpsn_count',
      ord_count: 'ord_count', ord_amount: 'ord_amount', realord_count: 'realord_count',
      realord_amount: 'realord_amount', visitors_sum: 'visitors_sum', click_sum: 'click_sum',
      ctr: 'ctr', conversion_rate: 'conversion_rate',
    },
  },
  visitSnapshot: {
    table: 'daily_visit_hourly',
    keys: ['stat_date', 'hour'],
    dateFrom: 'row',
    dateField: 'ord_date',
    hourFromDate: true,
    // 원본엔 당일(uv 등) + 전일비교(uv_p 등, _p 접미사) 행이 섞여 있음 → 전일 행은 skip
    skip: (row) => row['uv'] === undefined,
    map: {
      uv: 'uv', visitors: 'visitors', lv: 'lv', pv: 'pv', pv_per_uv: 'pv_per_uv',
      ord_cnt: 'ord_cnt', conversion_rate: 'conversion_rate',
    },
  },
  shopContributeHourly: {
    table: 'daily_store_hourly',
    keys: ['stat_date', 'hour', 'media', 'page_shop_ccode_name', 'page_name'],
    dateFrom: 'row',
    dateField: 'ord_date',
    hourFromDate: true,
    map: {
      media: 'media', page_shop_ccode_name: 'page_shop_ccode_name', page_name: 'page_name',
      uv: 'uv', visitors: 'visitors', pv: 'pv', ord_count: 'ord_count', ord_amount: 'ord_amount',
      realord_count: 'realord_count', realord_amount: 'realord_amount', bounce_rate: 'bounce_rate',
      all_benefit_amount: 'all_benefit_amount', benefit_dc_amount: 'benefit_dc_amount',
    },
  },
  searchKeywordDaily: {
    table: 'daily_search',
    keys: ['stat_date', 'url_keyword'],
    dateFrom: 'queryEnd',
    map: {
      url_keyword: 'url_keyword', search_success_yn: 'search_success_yn', searchs: 'searchs',
      uv: 'uv', clicks: 'clicks', unique_clicks: 'unique_clicks', unique_search: 'unique_search',
      cr: 'cr', ord_count: 'ord_count', ord_amount: 'ord_amount', search_value: 'search_value',
      item_cnt: 'item_cnt',
    },
  },
  couponPerf: {
    table: 'daily_coupon',
    keys: ['stat_date', 'prom_no'],
    dateFrom: 'row',
    dateField: 'ord_date',
    map: {
      prom_no: 'prom_no', prom_name: 'prom_name', prom_kind_group_code_name: 'prom_kind_group_code_name',
      coupon_dcode_name: 'coupon_dcode_name', regpsn_id: 'regpsn_id', modpsn_id: 'modpsn_id',
      coupon_occur_count: 'coupon_occur_count', coupon_use_count: 'coupon_use_count',
      coupon_realuse_count: 'coupon_realuse_count', coupon_cancel_count: 'coupon_cancel_count',
      coupon_recall_count: 'coupon_recall_count', coupon_reduct_count: 'coupon_reduct_count',
      ord_amount: 'ord_amount', realord_amount: 'realord_amount', benefit_amount: 'benefit_amount',
      benefit_dc_amount: 'benefit_dc_amount', cart_coupon_dc_amount: 'cart_coupon_dc_amount',
      md_burden_coupon_dc_amount: 'md_burden_coupon_dc_amount',
      mktg_burden_coupon_dc_amount: 'mktg_burden_coupon_dc_amount',
      branch_burden_coupon_dc_amount: 'branch_burden_coupon_dc_amount',
      vend_burden_coupon_dc_amount: 'vend_burden_coupon_dc_amount',
      cs_burden_coupon_dc_amount: 'cs_burden_coupon_dc_amount',
      max_burden_coupon_dc_amount: 'max_burden_coupon_dc_amount',
      etc_burden_coupon_dc_amount: 'etc_burden_coupon_dc_amount',
      shipcost_amount: 'shipcost_amount', shipcost_dc_amount: 'shipcost_dc_amount',
    },
  },
  itemCategoryRank: {
    table: 'daily_item_category_rank',
    keys: ['stat_date', 'item_no', 'small_class_disp_category_no'],
    dateFrom: 'queryEnd',
    map: {
      item_no: 'item_no', model_no: 'model_no', item_name: 'item_name',
      large_class_disp_category_no: 'large_class_disp_category_no',
      large_class_disp_category_name: 'large_class_disp_category_name',
      middle_class_disp_category_no: 'middle_class_disp_category_no',
      middle_class_disp_category_name: 'middle_class_disp_category_name',
      small_class_disp_category_no: 'small_class_disp_category_no',
      small_class_disp_category_name: 'small_class_disp_category_name',
      itemview_count: 'itemview_count', itemview_rank: 'itemview_rank',
      ord_amount: 'ord_amount', ord_amount_rank: 'ord_amount_rank',
      ord_count: 'ord_count', ord_count_rank: 'ord_count_rank',
      real_sale_amount: 'real_sale_amount', cart_qty: 'cart_qty', cart_qty_rank: 'cart_qty_rank',
      wish_qty: 'wish_qty', cancel_takeback_amount: 'cancel_takeback_amount',
    },
  },
}

function extractDateAndHour(raw: string): { date: string; hour: number | null } {
  // "2026-07-06 14:00:00" / "2026-07-06 14:00" / "2026-07-06" 모두 처리
  const m = String(raw).match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}))?/)
  if (!m) return { date: raw, hour: null }
  return { date: m[1], hour: m[2] != null ? Number(m[2]) : null }
}

// mergedRows 가 없는 요청 대응: entries[].rows 를 mergedRows 와 동일한 모양으로 직접 평탄화.
// (실시간 전송 시 mergedRows 를 생략하고 entries 만 보내는 경우가 있어, 양쪽 다 지원한다.)
type Entry = { collectedAt?: string; startDate?: string; endDate?: string; rows?: Record<string, unknown>[] }
function buildMergedRows(body: { endpointId?: string; mergedRows?: Record<string, unknown>[]; entries?: Entry[] }): Record<string, unknown>[] {
  if (Array.isArray(body.mergedRows) && body.mergedRows.length > 0) return body.mergedRows
  const entries = Array.isArray(body.entries) ? body.entries : []
  const out: Record<string, unknown>[] = []
  for (const e of entries) {
    if (!Array.isArray(e.rows)) continue
    for (const r of e.rows) {
      out.push({
        ...r,
        _query_start: e.startDate ?? null,
        _query_end: e.endDate ?? null,
        _collected_at: e.collectedAt ?? null,
        _source_endpoint: body.endpointId ?? null,
      })
    }
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST 만 허용됩니다.' }, 405)
  }
  if (!INGEST_KEY || req.headers.get('x-ingest-key') !== INGEST_KEY) {
    return json({ ok: false, error: '인증 실패(x-ingest-key 불일치)' }, 401)
  }

  let body: { endpointId?: string; mergedRows?: Record<string, unknown>[]; entries?: Entry[] }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'JSON 파싱 실패' }, 400)
  }

  const { endpointId } = body
  const mergedRows = buildMergedRows(body) // mergedRows 없으면 entries[].rows 로 평탄화

  if (!endpointId) return json({ ok: false, error: 'endpointId 누락' }, 400)

  const cfg = CONFIG[endpointId]
  if (!cfg) {
    // 아직 매핑 안 된 endpointId → 에러 대신 skip (스케줄러가 멈추지 않게)
    return json({ ok: true, endpointId, skipped: true, reason: '미지원 endpointId' })
  }
  if (!Array.isArray(mergedRows) || mergedRows.length === 0) {
    return json({ ok: true, endpointId, table: cfg.table, upserted: 0, reason: 'mergedRows 비어있음' })
  }

  const rowsToInsert: Record<string, unknown>[] = []
  for (const row of mergedRows) {
    if (cfg.skip?.(row)) continue

    let statDate: string
    let hour: number | null = null

    if (cfg.dateFrom === 'row') {
      const raw = row[cfg.dateField!]
      if (!raw) continue
      const parsed = extractDateAndHour(String(raw))
      statDate = parsed.date
      if (cfg.hourFromDate) hour = parsed.hour
    } else {
      const raw = row['_query_end']
      if (!raw) continue
      statDate = String(raw)
    }

    const out: Record<string, unknown> = {
      stat_date: statDate,
      _collected_at: row['_collected_at'] ?? null,
    }
    if (cfg.hourFromDate) out.hour = hour

    for (const [src, dst] of Object.entries(cfg.map)) {
      out[dst] = row[src] ?? null
    }
    rowsToInsert.push(out)
  }

  if (rowsToInsert.length === 0) {
    return json({ ok: true, endpointId, table: cfg.table, upserted: 0, reason: '저장할 행 없음(모두 skip)' })
  }

  const { error, count } = await supabase
    .from(cfg.table)
    .upsert(rowsToInsert, { onConflict: cfg.keys.join(','), count: 'exact' })

  if (error) {
    return json({ ok: false, endpointId, table: cfg.table, error: error.message }, 500)
  }
  return json({ ok: true, endpointId, table: cfg.table, upserted: count ?? rowsToInsert.length })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
