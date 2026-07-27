import { supabase, cloudEnabled } from '../lib/supabase'

const KEY_THIS = 'spao_v3_thisWeek'
const KEY_LAST = 'spao_v3_lastWeek'

// ─── 클라우드(Supabase) 동기화 ──────────────────────────────────────────────
// 전체 공유 단일 데이터셋: dashboard_state 테이블의 id=1 한 행만 사용
const ROW_ID = 1

export { cloudEnabled }

// 클라우드에서 공유 데이터 읽기
export async function loadCloudState() {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('dashboard_state')
      .select('this_week,last_week,updated_at,updated_by')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) { console.warn('클라우드 로드 실패:', error.message); return null }
    if (!data) return null
    return {
      thisWeek: data.this_week,
      lastWeek: data.last_week,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    }
  } catch (e) {
    console.warn('클라우드 로드 예외:', e)
    return null
  }
}

// 클라우드에 공유 데이터 저장 (단일 행 업데이트)
export async function saveCloudState(thisWeek, lastWeek, updatedBy = null) {
  if (!supabase) return { ok: false, reason: 'no-client' }
  try {
    const { error } = await supabase
      .from('dashboard_state')
      .update({
        this_week: thisWeek,
        last_week: lastWeek,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq('id', ROW_ID)
    if (error) { console.warn('클라우드 저장 실패:', error.message); return { ok: false, reason: error.message } }
    return { ok: true }
  } catch (e) {
    console.warn('클라우드 저장 예외:', e)
    return { ok: false, reason: e.message }
  }
}

// 다른 사용자가 업로드 시 실시간 반영 (best-effort, 미지원 환경에서도 안전)
export function subscribeCloud(onChange) {
  if (!supabase) return () => {}
  try {
    const ch = supabase
      .channel('dashboard_state_changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dashboard_state' },
        (payload) => onChange?.(payload.new))
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* noop */ } }
  } catch (e) {
    console.warn('실시간 구독 실패:', e)
    return () => {}
  }
}

// ─── 주차별 스냅샷 (weekly_snapshots) — Phase 1 ─────────────────────────────
// 인덱스(payload 제외)만 조회 — 시작 시 가볍게 목록 로드
export async function loadSnapshotIndex() {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('weekly_snapshots')
      .select('week_key,week_label,week_start,week_end,files_present,uploaded_at,updated_at,updated_by')
      .order('week_start', { ascending: false, nullsFirst: false })
      .order('week_key', { ascending: false })
    if (error) { console.warn('스냅샷 인덱스 로드 실패:', error.message); return [] }
    return data || []
  } catch (e) {
    console.warn('스냅샷 인덱스 로드 예외:', e)
    return []
  }
}

// 단일 주 payload 조회 — 주 클릭 시
export async function loadSnapshotPayload(weekKey) {
  if (!supabase || !weekKey) return null
  try {
    const { data, error } = await supabase
      .from('weekly_snapshots')
      .select('payload')
      .eq('week_key', weekKey)
      .maybeSingle()
    if (error) { console.warn('스냅샷 payload 로드 실패:', error.message); return null }
    return await decodePayload(data?.payload || null)
  } catch (e) {
    console.warn('스냅샷 payload 로드 예외:', e)
    return null
  }
}

// 클라우드 jsonb 저장 한도 가드.
// 핵심 제약은 본문 크기가 아니라 "행(row) 수"다 — Supabase Postgres 의 statement_timeout(~8초)은
// jsonb 안의 행이 많을수록 직렬화/저장 비용이 선형으로 늘어 타임아웃을 유발한다.
// 실측(현실적 ~530B/행): 1만 행 3.5초 OK · 2만 행 7.3초(경계) · 3만 행 타임아웃(57014).
// 따라서 storeCorner.items 행 수에 예산을 두고, 초과 시 "매출 상위 코너의 컨텐츠 디테일은 보존"하고
// 나머지 코너는 코너 단위로 축약(컨텐츠 1행으로 합침)해 행 수를 예산 이내로 맞춘다.
// (게이트웨이 본문 한도 24MB 는 보조 가드로만 사용.)
const CLOUD_ROW_BUDGET = 11_000         // storeCorner.items 행 수 상한 (실측 ~4초, 타임아웃 8초 대비 약 2배 여유)
const CLOUD_ROW_BUDGET_SAFE = 6_000     // 타임아웃 폴백용 안전 예산 (실측 ~2초, 반드시 저장되도록 더 작게)
const CLOUD_PAYLOAD_LIMIT = 18_000_000  // 직렬화 ~18MB (게이트웨이 본문 한도 보조 가드)

// storeCorner.items 를 (매체×매장그룹×매장상세명×코너명) 단위로 다시 합쳐 컨텐츠 행을 제거
function collapseStoreCorner(storeCorner) {
  if (!storeCorner || !Array.isArray(storeCorner.items)) return storeCorner
  const map = new Map()
  for (const i of storeCorner.items) {
    const k = `${i.media}|${i.storeGroup}|${i.detailName}|${i.cornerName}`
    let r = map.get(k)
    if (!r) {
      r = {
        media: i.media, storeGroup: i.storeGroup, detailName: i.detailName, cornerName: i.cornerName,
        contentNo: '', contentName: '',
        impressions: 0, clicks: 0, buyerCnt: 0, orderCnt: 0, realAmt: 0,
      }
      map.set(k, r)
    }
    r.impressions += i.impressions || 0
    r.clicks      += i.clicks || 0
    r.buyerCnt    += i.buyerCnt || 0
    r.orderCnt    += i.orderCnt || 0
    r.realAmt     += i.realAmt || 0
  }
  return { ...storeCorner, items: Array.from(map.values()) }
}

// 한 코너의 컨텐츠 행들을 컨텐츠 없는 코너 단위 한 행으로 합친다.
function collapseRows(rows) {
  const f = rows[0]
  const r = {
    media: f.media, storeGroup: f.storeGroup, detailName: f.detailName, cornerName: f.cornerName,
    contentNo: '', contentName: '',
    impressions: 0, clicks: 0, buyerCnt: 0, orderCnt: 0, realAmt: 0,
  }
  for (const x of rows) {
    r.impressions += x.impressions || 0
    r.clicks      += x.clicks || 0
    r.buyerCnt    += x.buyerCnt || 0
    r.orderCnt    += x.orderCnt || 0
    r.realAmt     += x.realAmt || 0
  }
  return r
}

// 예산을 넘는 하위(저매출) 코너들을 단 하나의 '기타' 집계 행으로 접는다 → 행 수 하드 상한 보장.
function collapseExcessCorners(corners) {
  const first = corners[0]?.rows?.[0] || {}
  const r = {
    media: first.media || 'MOBILE', storeGroup: first.storeGroup || '기획전매장',
    detailName: '기타', cornerName: `기타 ${corners.length}개 코너`,
    contentNo: '', contentName: '',
    impressions: 0, clicks: 0, buyerCnt: 0, orderCnt: 0, realAmt: 0,
  }
  for (const c of corners) {
    for (const x of c.rows) {
      r.impressions += x.impressions || 0
      r.clicks      += x.clicks || 0
      r.buyerCnt    += x.buyerCnt || 0
      r.orderCnt    += x.orderCnt || 0
      r.realAmt     += x.realAmt || 0
    }
  }
  return r
}

// storeCorner.items 를 행 예산(rowBudget) 이내로 줄인다 — 출력 행 수는 항상 rowBudget 이하임을 보장한다.
// 코너를 매출(realAmt) 합계 내림차순으로 정렬해, 예산이 허용하는 한 상위 코너는 컨텐츠를 전부 보존하고
// 예산을 넘는 하위 코너는 코너 단위(컨텐츠 1행)로 축약한다 → 드릴다운이 중요한 고매출 코너 디테일 우선 보존.
// 코너 수 자체가 예산을 넘으면 상위 (rowBudget-1) 코너만 남기고 나머지는 하나의 '기타' 행으로 접는다.
export function budgetStoreCorner(storeCorner, rowBudget) {
  if (!storeCorner || !Array.isArray(storeCorner.items)) return storeCorner
  const items = storeCorner.items
  if (items.length <= rowBudget) return storeCorner

  // 코너 단위 그룹핑 + 매출 합계
  const groups = new Map()
  for (const i of items) {
    const k = `${i.media}|${i.storeGroup}|${i.detailName}|${i.cornerName}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(i)
  }
  const corners = []
  for (const rows of groups.values()) {
    let total = 0
    for (const r of rows) total += r.realAmt || 0
    corners.push({ rows, total })
  }
  // 매출 상위 코너부터 컨텐츠 보존 기회를 준다
  corners.sort((a, b) => b.total - a.total)

  // 하드 상한: 코너 수가 예산보다 많으면 상위 (rowBudget-1) 코너만 코너 단위로 남기고
  // 나머지 하위 코너는 단 하나의 '기타' 행으로 접어 행 수를 무조건 예산 이내로 만든다.
  // (코너가 몇 개든 폴백 본문 크기가 작아져 반드시 저장된다.)
  if (corners.length > rowBudget) {
    const keep = corners.slice(0, rowBudget - 1)
    const rest = corners.slice(rowBudget - 1)
    const out = keep.map((c) => collapseRows(c.rows))
    out.push(collapseExcessCorners(rest))
    return { ...storeCorner, items: out }
  }

  // 코너 수 ≤ 예산: 모든 코너는 최소 1행(축약본)을 차지한다. 남는 예산만큼 상위 코너의 컨텐츠를 펼친다.
  let remaining = Math.max(0, rowBudget - corners.length)
  const out = []
  for (const c of corners) {
    const extra = c.rows.length - 1 // 컨텐츠를 전부 펼칠 때 추가로 드는 행 수
    if (extra <= 0) {
      out.push(c.rows[0])                 // 컨텐츠 1개 이하 → 그대로 (축약본과 동일)
    } else if (remaining >= extra) {
      out.push(...c.rows)                 // 예산 여유 → 컨텐츠 전체 보존
      remaining -= extra
    } else {
      out.push(collapseRows(c.rows))      // 예산 부족 → 코너 단위 축약
    }
  }
  return { ...storeCorner, items: out }
}

// payload 의 storeCorner 행 수가 예산을 넘으면 축약한 사본을 돌려준다.
export function fitPayloadForCloud(payload) {
  try {
    const sc = payload?.storeCorner
    const rowCount = Array.isArray(sc?.items) ? sc.items.length : 0
    let working = payload
    let shrunk = false

    // 1) 행 수 예산 초과 → 고매출 코너 컨텐츠 우선 보존, 나머지 코너 단위 축약
    if (rowCount > CLOUD_ROW_BUDGET) {
      working = { ...payload, storeCorner: budgetStoreCorner(sc, CLOUD_ROW_BUDGET) }
      shrunk = true
    }

    // 2) 직렬화 크기 보조 가드(게이트웨이 본문 한도) — 그래도 크면 코너 단위 완전 축약
    if (working?.storeCorner && JSON.stringify(working).length > CLOUD_PAYLOAD_LIMIT) {
      return { payload: { ...working, storeCorner: collapseStoreCorner(working.storeCorner) }, shrunk: true }
    }
    return { payload: working, shrunk }
  } catch {
    return { payload, shrunk: false }
  }
}

// Postgres statement timeout(57014) 판별 — 메시지/코드 양쪽 확인
export function isStatementTimeout(error) {
  if (!error) return false
  return error.code === '57014' || /statement timeout/i.test(error.message || '')
}

// ─── payload 압축(gzip) ──────────────────────────────────────────────────────
// 클라우드 jsonb 에 payload 전체를 gzip→base64 한 단일 문자열({ _gz })로 저장한다.
// 핵심: Postgres statement_timeout(~8초)은 jsonb 의 구조/행 수가 많을수록 직렬화 비용이 커서 걸린다.
// 실측: 원본 15MB·86,650행 = 32초(타임아웃 57014) → gzip 1.9MB 단일 문자열 = 1.8초 저장 성공.
// 행이 아무리 많아도 단 하나의 문자열 값이라 저장이 빠르고, 데이터가 커져도 안전하다.
const gzipSupported = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

function bytesToB64(bytes) {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}
function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
async function gzipToB64(str) {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(new TextEncoder().encode(str))
  writer.close()
  const buf = await new Response(cs.readable).arrayBuffer()
  return bytesToB64(new Uint8Array(buf))
}
async function gunzipFromB64(b64) {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(b64ToBytes(b64))
  writer.close()
  const buf = await new Response(ds.readable).arrayBuffer()
  return new TextDecoder().decode(buf)
}

// 저장된 payload 가 { _gz } 압축 형식이면 풀어 원본 객체로 돌려준다(구버전 평문 payload 는 그대로 통과).
export async function decodePayload(stored) {
  if (stored && typeof stored === 'object' && typeof stored._gz === 'string') {
    try { return JSON.parse(await gunzipFromB64(stored._gz)) }
    catch (e) { console.warn('payload 압축 해제 실패:', e); return null }
  }
  return stored
}

// 주차 저장/덮어쓰기 — week_key 기준 upsert.
// 1차: 행 예산 적용본으로 저장(고매출 코너 컨텐츠 보존).
// 저장 본문은 payload 전체를 gzip 압축한 단일 문자열({ _gz })로 보낸다 → 행 수와 무관하게 빠르게 저장(타임아웃 회피).
// 압축 미지원(구형 브라우저) 환경에서는 행 예산 축약본으로 폴백한다.
export async function upsertSnapshot({ weekKey, weekLabel, weekStart, weekEnd, payload, filesPresent = [], updatedBy = null }) {
  if (!supabase) return { ok: false, reason: 'no-client' }
  if (!weekKey) return { ok: false, reason: 'no-week-key' }
  try {
    const base = {
      week_key: weekKey,
      week_label: weekLabel || weekKey,
      week_start: weekStart || null,
      week_end: weekEnd || null,
      files_present: filesPresent,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    }
    const write = (p) => supabase.from('weekly_snapshots').upsert({ ...base, payload: p }, { onConflict: 'week_key' })

    let error
    let shrunk = false

    if (gzipSupported && payload) {
      // payload 전체를 gzip 단일 문자열로 저장 → 데이터가 아무리 많아도 컨텐츠 손실 없이 빠르게 저장된다.
      const gz = await gzipToB64(JSON.stringify(payload))
      ;({ error } = await write({ _gz: gz }))
    } else {
      // 폴백(압축 미지원): 행 예산 축약본 저장, 타임아웃 시 더 작은 안전 예산으로 재시도.
      const fitted = fitPayloadForCloud(payload)
      ;({ error } = await write(fitted.payload))
      shrunk = fitted.shrunk
      if (isStatementTimeout(error) && payload?.storeCorner) {
        const safe = { ...payload, storeCorner: budgetStoreCorner(payload.storeCorner, CLOUD_ROW_BUDGET_SAFE) }
        shrunk = true
        ;({ error } = await write(safe))
      }
    }

    if (error) { console.warn('스냅샷 저장 실패:', error.message); return { ok: false, reason: error.message } }
    return { ok: true, shrunk }
  } catch (e) {
    console.warn('스냅샷 저장 예외:', e)
    return { ok: false, reason: e.message }
  }
}

// 주차 삭제 (Phase 4 관리)
export async function deleteSnapshot(weekKey) {
  if (!supabase || !weekKey) return { ok: false, reason: 'no-client-or-key' }
  try {
    const { error } = await supabase
      .from('weekly_snapshots')
      .delete()
      .eq('week_key', weekKey)
    if (error) { console.warn('스냅샷 삭제 실패:', error.message); return { ok: false, reason: error.message } }
    return { ok: true }
  } catch (e) {
    console.warn('스냅샷 삭제 예외:', e)
    return { ok: false, reason: e.message }
  }
}

// 주차 메타(라벨 등) 수정 — payload 는 건드리지 않음 (Phase 4 관리)
export async function updateSnapshotMeta(weekKey, { weekLabel, weekStart, weekEnd, updatedBy = null } = {}) {
  if (!supabase || !weekKey) return { ok: false, reason: 'no-client-or-key' }
  try {
    const patch = { updated_at: new Date().toISOString(), updated_by: updatedBy }
    if (weekLabel !== undefined) patch.week_label = weekLabel
    if (weekStart !== undefined) patch.week_start = weekStart || null
    if (weekEnd !== undefined) patch.week_end = weekEnd || null
    const { error } = await supabase
      .from('weekly_snapshots')
      .update(patch)
      .eq('week_key', weekKey)
    if (error) { console.warn('스냅샷 메타 수정 실패:', error.message); return { ok: false, reason: error.message } }
    return { ok: true }
  } catch (e) {
    console.warn('스냅샷 메타 수정 예외:', e)
    return { ok: false, reason: e.message }
  }
}

// 스냅샷 추가/수정 실시간 구독 (인덱스 갱신용 알림)
export function subscribeSnapshots(onChange) {
  if (!supabase) return () => {}
  try {
    const ch = supabase
      .channel('weekly_snapshots_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_snapshots' },
        (payload) => onChange?.(payload))
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* noop */ } }
  } catch (e) {
    console.warn('스냅샷 구독 실패:', e)
    return () => {}
  }
}

// ─── 일자별 자동 적재 상태 (daily_* 스테이징 테이블) ─────────────────────────
// 아직 daily_* → weekly_snapshots 롤업은 없다. 이 함수는 "자동 수집이 오늘 얼마나
// 들어왔는지"만 참고용으로 보여주기 위한 것 — 화면(주차) 데이터와는 별개다.
const INGEST_TABLES = [
  'daily_sales_by_date', 'daily_sales', 'daily_cart', 'daily_wishlist', 'daily_customer',
  'daily_visit_hourly', 'daily_store_hourly', 'daily_search', 'daily_coupon', 'daily_item_category_rank',
]

export async function getDailyIngestStatus() {
  if (!supabase) return null
  const today = new Date().toISOString().slice(0, 10)
  try {
    const results = await Promise.all(INGEST_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select('_ingested_at', { count: 'exact', head: true })
        .eq('stat_date', today)
      if (error) return { table, ok: false, count: 0 }
      return { table, ok: true, count: count || 0 }
    }))
    const withData = results.filter(r => r.ok && r.count > 0)
    if (withData.length === 0) return { datasetsToday: 0, totalDatasets: INGEST_TABLES.length, lastIngestedAt: null }

    // 가장 최근 _ingested_at 하나만 별도 조회(대표값)
    const { data: latestRow } = await supabase
      .from(withData[0].table)
      .select('_ingested_at')
      .eq('stat_date', today)
      .order('_ingested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      datasetsToday: withData.length,
      totalDatasets: INGEST_TABLES.length,
      lastIngestedAt: latestRow?._ingested_at || null,
    }
  } catch (e) {
    console.warn('일자별 적재 상태 조회 예외:', e)
    return null
  }
}

// 로컬 캐시 저장.
// 전체 주간 데이터(코너 집계 포함)는 localStorage 한도(~5MB)를 넘을 수 있다.
// 클라우드가 공유 데이터의 원천이므로 localStorage 는 "있으면 좋은" 즉시 로드 캐시일 뿐이다.
// 한도 초과 시: 용량이 가장 큰 storeCorner 를 뺀 경량본으로 재시도하고,
// 그래도 실패하면 키를 비워 손상된/오래된 상태가 남지 않게 한다.
function setWeekKeys(thisWeek, lastWeek) {
  localStorage.setItem(KEY_THIS, JSON.stringify(thisWeek))
  localStorage.setItem(KEY_LAST, JSON.stringify(lastWeek))
}

const stripHeavy = (week) => {
  if (!week || typeof week !== 'object') return week
  // storeCorner 는 코너 단위로 집계했어도 수천 행이라 로컬 캐시에서 제외(클라우드에서 복원).
  const { storeCorner, ...rest } = week
  return storeCorner ? { ...rest, storeCorner: null } : week
}

export function saveState(thisWeek, lastWeek) {
  try {
    setWeekKeys(thisWeek, lastWeek)
  } catch {
    // 1차 실패(주로 QuotaExceeded) → storeCorner 제외하고 경량 재시도
    try {
      setWeekKeys(stripHeavy(thisWeek), stripHeavy(lastWeek))
    } catch {
      // 그래도 실패 → 손상 방지를 위해 로컬 캐시 비우기 (클라우드가 원천)
      try { localStorage.removeItem(KEY_THIS); localStorage.removeItem(KEY_LAST) } catch { /* noop */ }
    }
  }
}

export function loadState() {
  try {
    const t = localStorage.getItem(KEY_THIS)
    const l = localStorage.getItem(KEY_LAST)
    if (!t) return null
    return {
      thisWeek: JSON.parse(t),
      lastWeek: l ? JSON.parse(l) : null,
    }
  } catch (e) {
    console.warn('localStorage 로드 실패:', e)
    return null
  }
}

export function clearState() {
  localStorage.removeItem(KEY_THIS)
  localStorage.removeItem(KEY_LAST)
}

export function exportJSON(thisWeek, lastWeek) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const blob = new Blob([JSON.stringify({ thisWeek, lastWeek }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `spao_dashboard_${date}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        resolve({ thisWeek: data.thisWeek || null, lastWeek: data.lastWeek || null })
      } catch (err) {
        reject(new Error('JSON 파싱 실패: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsText(file)
  })
}
