// ════════════════════════════════════════════════════════════════════════
// 주차 키(week_key) 산출 — period 문자열에서 ISO 주차를 자동 추출
// 순수 함수 모음. 업로드 시 자동 산출 → 사용자가 확인/수정.
// ════════════════════════════════════════════════════════════════════════

// 로컬 기준 YYYY-MM-DD 문자열
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// period 문자열에서 날짜 토큰 추출.
// 우선 YYYY-MM-DD(구분자 . - /) 를 찾고, 없으면 MM-DD(연도는 fallbackYear) 를 찾는다.
function parseDates(str, fallbackYear) {
  if (!str || typeof str !== 'string') return []
  const out = []
  const full = [...str.matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)]
  for (const m of full) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (!isNaN(d)) out.push(d)
  }
  if (out.length) return out
  const md = [...str.matchAll(/(\d{1,2})[.\-/](\d{1,2})/g)]
  for (const m of md) {
    const mo = Number(m[1]), da = Number(m[2])
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(fallbackYear, mo - 1, da)
      if (!isNaN(d)) out.push(d)
    }
  }
  return out
}

// ISO 8601 주차 (월요일 시작, 목요일 기준 연도)
export function isoWeekParts(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7 // 월=0 … 일=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3) // 이번 주 목요일
  const firstThursday = target.getTime()
  target.setUTCMonth(0, 1)
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7)
  }
  const week = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000)
  const isoYear = new Date(firstThursday).getUTCFullYear()
  return { year: isoYear, week }
}

// 해당 날짜가 속한 주의 월요일~일요일 (로컬)
function weekRange(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNr = (d.getDay() + 6) % 7 // 월=0 … 일=6
  const monday = new Date(d); monday.setDate(d.getDate() - dayNr)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { monday, sunday }
}

// 표시용 라벨: "6월 1주" (시작일의 월 + 월 내 주차)
function monthWeekLabel(date) {
  return `${date.getMonth() + 1}월 ${Math.ceil(date.getDate() / 7)}주`
}

// period 문자열 → { weekKey, weekLabel, weekStart, weekEnd, ok }
// 파싱 실패 시 ok:false 이고 빈 값 (사용자가 모달에서 직접 입력).
export function deriveWeekKey(periodStr, fallbackYear = new Date().getFullYear()) {
  const dates = parseDates(periodStr, fallbackYear)
  if (!dates.length) {
    return { weekKey: '', weekLabel: '', weekStart: '', weekEnd: '', ok: false }
  }
  dates.sort((a, b) => a - b)
  const start = dates[0]
  const end = dates[dates.length - 1]
  const { year, week } = isoWeekParts(start)
  const weekKey = `${year}-W${String(week).padStart(2, '0')}`
  const { monday, sunday } = weekRange(start)
  // 날짜가 둘 이상이면 파싱한 실제 범위, 하나면 ISO 월~일
  const ws = dates.length > 1 ? start : monday
  const we = dates.length > 1 ? end : sunday
  return {
    weekKey,
    weekLabel: monthWeekLabel(start),
    weekStart: toISODate(ws),
    weekEnd: toISODate(we),
    ok: true,
  }
}

// 단일 날짜(YYYY-MM-DD) → 그 날짜가 속한 주의 { weekKey, weekLabel, weekStart, weekEnd }.
// 사용자가 모달에서 "이 데이터가 속한 날짜" 를 고르면 주차 키를 자동 재계산하는 데 쓴다.
// (사용자가 ISO 주차 번호를 직접 계산할 필요가 없도록 한다)
export function deriveFromDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { weekKey: '', weekLabel: '', weekStart: '', weekEnd: '', ok: false }
  }
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return { weekKey: '', weekLabel: '', weekStart: '', weekEnd: '', ok: false }
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(date)) return { weekKey: '', weekLabel: '', weekStart: '', weekEnd: '', ok: false }
  const { year, week } = isoWeekParts(date)
  const weekKey = `${year}-W${String(week).padStart(2, '0')}`
  const { monday, sunday } = weekRange(date)
  return {
    weekKey,
    weekLabel: monthWeekLabel(monday),
    weekStart: toISODate(monday),
    weekEnd: toISODate(sunday),
    ok: true,
  }
}
