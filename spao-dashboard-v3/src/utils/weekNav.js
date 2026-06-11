// ════════════════════════════════════════════════════════════════════════
// 주차 내비게이션 순수 함수 — 스냅샷 인덱스에서 직전/최근 주 키를 계산.
// 정렬 순서에 의존하지 않고 week_start(없으면 week_key)로 직접 비교한다.
// index 원소 형태: { week_key, week_start, ... }
// ════════════════════════════════════════════════════════════════════════

// 정렬용 비교 키: 날짜 문자열(YYYY-MM-DD) 우선, 없으면 week_key(YYYY-Www)도
// 사전식으로 시간순과 일치하므로 폴백으로 사용한다.
const sortKey = (r) => r.week_start || r.week_key || ''

// weekKey 바로 직전(더 과거) 주의 week_key. 없으면 null.
export function previousWeekKey(index, weekKey) {
  if (!Array.isArray(index)) return null
  const cur = index.find(r => r.week_key === weekKey)
  if (!cur) return null
  const curK = sortKey(cur)
  const older = index.filter(r => r.week_key !== weekKey && sortKey(r) < curK)
  if (!older.length) return null
  older.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1)) // 최신순
  return older[0].week_key
}

// 가장 최근(최신) 주의 week_key. 비었으면 null.
export function mostRecentWeekKey(index) {
  if (!Array.isArray(index) || index.length === 0) return null
  const sorted = [...index].sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1))
  return sorted[0].week_key
}
