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
    return data?.payload || null
  } catch (e) {
    console.warn('스냅샷 payload 로드 예외:', e)
    return null
  }
}

// 클라우드 jsonb 저장 한도 가드.
// Supabase API 게이트웨이는 본문이 너무 크면 전송에 실패한다(측정: 24MB OK, 32MB 실패).
// 가장 무거운 storeCorner(코너×컨텐츠) 가 한도를 넘기면 코너별 컨텐츠 상위 N개만 남기고
// 나머지를 "기타"로 접어 점진적으로 축소(progressive recap)한다 → 컨텐츠 디테일을 최대한 보존.
// 그래도 한도를 넘으면 마지막 수단으로 코너 단위 완전 축약(컨텐츠 제거).
const CLOUD_PAYLOAD_LIMIT = 18_000_000  // 직렬화 ~18MB (측정 한도 24MB 아래 안전 마진)
const RECAP_STEPS = [12, 6, 3]           // 코너별 컨텐츠 상위 N개로 점진 축소

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

// storeCorner.items 를 코너별 컨텐츠 상위 topN 개만 남기고 나머지는 "기타 N개" 한 행으로 접는다.
function recapStoreCorner(storeCorner, topN) {
  if (!storeCorner || !Array.isArray(storeCorner.items)) return storeCorner
  // 코너 단위로 그룹핑
  const groups = new Map()
  for (const i of storeCorner.items) {
    const k = `${i.media}|${i.storeGroup}|${i.detailName}|${i.cornerName}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(i)
  }
  const out = []
  for (const rows of groups.values()) {
    const sorted = [...rows].sort((a, b) => (b.realAmt || 0) - (a.realAmt || 0))
    const keep = sorted.slice(0, topN)
    const rest = sorted.slice(topN)
    out.push(...keep)
    if (rest.length > 0) {
      const f = rest[0]
      const etc = {
        media: f.media, storeGroup: f.storeGroup, detailName: f.detailName, cornerName: f.cornerName,
        contentNo: '', contentName: `기타 ${rest.length}개`,
        impressions: 0, clicks: 0, buyerCnt: 0, orderCnt: 0, realAmt: 0,
      }
      for (const r of rest) {
        etc.impressions += r.impressions || 0
        etc.clicks      += r.clicks || 0
        etc.buyerCnt    += r.buyerCnt || 0
        etc.orderCnt    += r.orderCnt || 0
        etc.realAmt     += r.realAmt || 0
      }
      out.push(etc)
    }
  }
  return { ...storeCorner, items: out }
}

// payload 가 한도를 넘으면 storeCorner 를 점진 축약한 사본을 돌려준다.
function fitPayloadForCloud(payload) {
  try {
    if (JSON.stringify(payload).length <= CLOUD_PAYLOAD_LIMIT) return { payload, shrunk: false }
    if (payload?.storeCorner) {
      // 1) 점진 축소: 코너별 컨텐츠 상위 12 → 6 → 3 개로 줄여보며 한도 안에 들면 채택
      for (const topN of RECAP_STEPS) {
        const reduced = { ...payload, storeCorner: recapStoreCorner(payload.storeCorner, topN) }
        if (JSON.stringify(reduced).length <= CLOUD_PAYLOAD_LIMIT) return { payload: reduced, shrunk: true }
      }
      // 2) 마지막 수단: 코너 단위 완전 축약(컨텐츠 제거)
      const collapsed = { ...payload, storeCorner: collapseStoreCorner(payload.storeCorner) }
      return { payload: collapsed, shrunk: true }
    }
    return { payload, shrunk: false }
  } catch {
    return { payload, shrunk: false }
  }
}

// 주차 저장/덮어쓰기 — week_key 기준 upsert
export async function upsertSnapshot({ weekKey, weekLabel, weekStart, weekEnd, payload, filesPresent = [], updatedBy = null }) {
  if (!supabase) return { ok: false, reason: 'no-client' }
  if (!weekKey) return { ok: false, reason: 'no-week-key' }
  try {
    const now = new Date().toISOString()
    const fitted = fitPayloadForCloud(payload)
    const row = {
      week_key: weekKey,
      week_label: weekLabel || weekKey,
      week_start: weekStart || null,
      week_end: weekEnd || null,
      payload: fitted.payload,
      files_present: filesPresent,
      updated_at: now,
      updated_by: updatedBy,
    }
    const { error } = await supabase
      .from('weekly_snapshots')
      .upsert(row, { onConflict: 'week_key' })
    if (error) { console.warn('스냅샷 저장 실패:', error.message); return { ok: false, reason: error.message } }
    return { ok: true, shrunk: fitted.shrunk }
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
