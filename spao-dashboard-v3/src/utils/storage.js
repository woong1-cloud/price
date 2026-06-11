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
