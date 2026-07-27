// ─── 기간 합산 (월/분기) ──────────────────────────────────────────────────────
// 여러 주차 payload 를 하나로 합쳐 월/분기 보기를 만든다.
// 핵심 규칙:
//  - 흐름(flow) 데이터셋: items 를 이어붙이고(concat) sigma 는 항목별 합산.
//    → 하위 컴포넌트(computeAllDerived 등)가 합쳐진 items 로 비율을 "재계산"하므로 정확.
//  - restock(재입고 대기): "잔량 스냅샷"이라 합산하면 중복 → 기간 내 "최신 주" 값만 사용.
//  - UV·구매고객수 같은 unique 지표는 합산 시 중복 포함(과대) → 화면에서 라벨로 안내(여기선 합산만).

export function mergePayloads(payloads) {
  const list = (payloads || []).filter(Boolean)
  if (list.length === 0) return null
  if (list.length === 1) return list[0]

  const keys = new Set()
  list.forEach(p => Object.keys(p).forEach(k => { if (p[k]) keys.add(k) }))

  const out = {}
  for (const key of keys) {
    const parts = list.map(p => p[key]).filter(Boolean)
    if (parts.length === 0) continue

    // 재입고 대기 = 기간 내 최신(마지막) 주 값만 (합산 금지)
    if (key === 'restock') { out[key] = parts[parts.length - 1]; continue }

    const items = []
    for (const part of parts) if (Array.isArray(part.items)) items.push(...part.items)

    if (items.length === 0) { out[key] = parts[parts.length - 1]; continue }

    const merged = { items }
    const sigmas = parts.map(p => p.sigma).filter(Boolean)
    if (sigmas.length) {
      const s = {}
      for (const sg of sigmas) for (const f of Object.keys(sg)) s[f] = (s[f] || 0) + (Number(sg[f]) || 0)
      merged.sigma = s
    }
    out[key] = merged
  }
  return out
}

// week_start(YYYY-MM-DD) → 기간 키
export function monthKeyOf(weekStart)   { return String(weekStart || '').slice(0, 7) } // 'YYYY-MM'
export function quarterKeyOf(weekStart) {
  const s = String(weekStart || '')
  if (s.length < 7) return ''
  const q = Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1
  return `${s.slice(0, 4)}-Q${q}`
}
export function periodKeyOf(weekStart, mode) {
  return mode === 'quarter' ? quarterKeyOf(weekStart) : monthKeyOf(weekStart)
}

// 기간 표시 라벨
export function periodLabel(periodKey, mode) {
  if (!periodKey) return ''
  if (mode === 'quarter') return periodKey.replace('-Q', ' Q')
  const [y, m] = periodKey.split('-')
  return `${y}년 ${Number(m)}월`
}

// 인덱스에서 모드별 기간 목록 (최신 desc). 주차는 week_start 의 월/분기로 귀속.
export function listPeriods(index, mode) {
  const map = new Map()
  for (const r of index || []) {
    if (!r.week_start) continue
    const k = periodKeyOf(r.week_start, mode)
    if (!k) continue
    if (!map.has(k)) map.set(k, { key: k, label: periodLabel(k, mode), weeks: [] })
    map.get(k).weeks.push(r.week_key)
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}

// 특정 기간에 속한 week_key 목록 (week_start 기준 정렬 오름차순)
export function weekKeysInPeriod(index, mode, periodKey) {
  return (index || [])
    .filter(r => r.week_start && periodKeyOf(r.week_start, mode) === periodKey)
    .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
    .map(r => r.week_key)
}

// 직전 기간 키 (비교 기본값)
export function previousPeriodKey(index, mode, periodKey) {
  const keys = listPeriods(index, mode).map(p => p.key) // desc
  const i = keys.indexOf(periodKey)
  return (i >= 0 && i + 1 < keys.length) ? keys[i + 1] : null
}
