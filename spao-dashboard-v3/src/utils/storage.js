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

export function saveState(thisWeek, lastWeek) {
  try {
    localStorage.setItem(KEY_THIS, JSON.stringify(thisWeek))
    localStorage.setItem(KEY_LAST, JSON.stringify(lastWeek))
  } catch (e) {
    console.warn('localStorage 저장 실패:', e)
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
