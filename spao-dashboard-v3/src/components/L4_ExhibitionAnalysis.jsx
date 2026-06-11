import { useMemo, useState, useRef, useEffect } from 'react'

// ─── 상수 ────────────────────────────────────────────────────────────────────
const MEDIA_OPTIONS = [
  { id: 'ALL',    label: '전체' },
  { id: 'APP',    label: 'APP' },
  { id: 'PC',     label: 'PC' },
  { id: 'MOBILE', label: 'MOBILE' },
]

const GROUP_OPTIONS = [
  { id: '기획전매장',   label: '🎪 기획전' },
  { id: '카테고리매장', label: '📂 카테고리' },
  { id: '검색매장',    label: '🔍 검색' },
  { id: '홈매장',      label: '🏠 홈' },
  { id: 'ALL',         label: '전체' },
]

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
const fmtAmt   = v => v >= 1e8 ? `${(v/1e8).toFixed(2)}억` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : `${v.toLocaleString()}원`
const fmtComma = v => (v ?? 0).toLocaleString()
const fmtPct   = v => `${(v * 100).toFixed(1)}%`
const fmtCTR   = v => `${(v * 100).toFixed(2)}%`

function heatBg(ratio) {
  if (ratio <= 0) return '#F8F8F7'
  const r = Math.round(255 - ratio * 80)
  const g = Math.round(255 - ratio * 30)
  const b = Math.round(245 - ratio * 120)
  return `rgb(${r},${g},${b})`
}

// ─── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = '#378ADD' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{icon}</span>{label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── 섹션 헤더 ────────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1A1A1A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
    </div>
  )
}

// ─── 집계 유틸 ────────────────────────────────────────────────────────────────
function aggregate(items) {
  const imp   = items.reduce((s, i) => s + i.impressions, 0)
  const clk   = items.reduce((s, i) => s + i.clicks, 0)
  const buyer = items.reduce((s, i) => s + i.buyerCnt, 0)
  const order = items.reduce((s, i) => s + i.orderCnt, 0)
  const realAmt = items.reduce((s, i) => s + i.realAmt, 0)
  const ctr   = imp > 0 ? clk / imp : 0
  const cvr   = clk > 0 ? buyer / clk : 0
  return { imp, clk, buyer, order, realAmt, ctr, cvr }
}

// ─── 전체 기획전 리스트 테이블 ────────────────────────────────────────────────
function ExhibitionTable({ rows, selectedKey, onSelect, keyField = 'detailName' }) {
  // 바 너비: 최대값 대비 (시각적 비교용)
  const maxAmt   = Math.max(...rows.map(r => r.realAmt), 1)
  // 기여 비중: 전체 합계 대비 (올바른 %)
  const totalAmt = rows.reduce((s, r) => s + r.realAmt, 0) || 1

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: '#F8F8F7' }}>
            {['구역명', '노출수', '클릭수', 'CTR', '주문금액', '실주문금액', '구매전환율', '구매기여 비중'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: h === '구역명' ? 'left' : 'right', fontWeight: 600, color: '#6B6B68', whiteSpace: 'nowrap', borderBottom: '1px solid #E8E8E6' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isSelected = selectedKey === row[keyField]
            const barRatio  = maxAmt > 0 ? row.realAmt / maxAmt : 0   // 바 너비 전용
            const share     = totalAmt > 0 ? row.realAmt / totalAmt : 0 // 표시용 비중
            return (
              <tr key={row[keyField]}
                onClick={() => onSelect(isSelected ? null : row[keyField])}
                style={{
                  background: isSelected ? '#EFF6FF' : '#fff',
                  cursor: 'pointer',
                  borderBottom: isSelected ? '2px solid #378ADD' : '1px solid #F0F0EE',
                  transition: 'background 0.15s',
                  outline: isSelected ? '2px solid #BFDBFE' : 'none',
                  outlineOffset: -1,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F8F8F7' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#fff' }}
              >
                <td style={{ padding: '9px 12px', fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1D4ED8' : '#1A1A1A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%',
                    background: isSelected ? '#378ADD' : '#F0F0EE',
                    color: isSelected ? '#fff' : '#A0A09E',
                    fontSize: '0.625rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {isSelected ? '▼' : '▶'}
                  </span>
                  {row[keyField] || '(미분류)'}
                  {isSelected && (
                    <span style={{ fontSize: '0.6875rem', background: '#BFDBFE', color: '#1D4ED8', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
                      상세보기 ↓
                    </span>
                  )}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(row.imp)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(row.clk)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: row.ctr > 0.03 ? '#1A8060' : '#6B6B68', fontWeight: row.ctr > 0.03 ? 600 : 400 }}>{fmtCTR(row.ctr)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtAmt(row.orderAmt ?? 0)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#1A1A1A', background: heatBg(barRatio) }}>{fmtAmt(row.realAmt)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: row.cvr > 0.02 ? '#1A8060' : '#6B6B68' }}>{fmtPct(row.cvr)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: '#E8E8E6', overflow: 'hidden' }}>
                      <div style={{ width: `${barRatio * 100}%`, height: '100%', background: '#378ADD', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#6B6B68', minWidth: 36, textAlign: 'right' }}>{fmtPct(share)}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── 드릴다운 패널 ────────────────────────────────────────────────────────────
function DrilldownPanel({ title, items }) {
  const agg = useMemo(() => aggregate(items), [items])

  // 코너별 집계
  const cornerRows = useMemo(() => {
    const map = {}
    for (const i of items) {
      const key = i.cornerName || '(미지정)'
      if (!map[key]) map[key] = { cornerName: key, imp: 0, clk: 0, buyer: 0, realAmt: 0 }
      map[key].imp    += i.impressions
      map[key].clk    += i.clicks
      map[key].buyer  += i.buyerCnt
      map[key].realAmt+= i.realAmt
    }
    return Object.values(map)
      .map(r => ({ ...r, ctr: r.imp > 0 ? r.clk / r.imp : 0, cvr: r.clk > 0 ? r.buyer / r.clk : 0 }))
      .sort((a, b) => b.realAmt - a.realAmt)
  }, [items])

  // 상품(컨텐츠)별 집계
  const contentRows = useMemo(() => {
    const map = {}
    for (const i of items) {
      // 상품명에서 스타일코드 제거하여 표시용 이름 생성
      const rawName = i.contentName || '(미지정)'
      const displayName = rawName.replace(/_SP[A-Z]{2}[A-Z]\d{2}[A-Z]\d{2}$/, '').trim()
      const key = i.contentNo || rawName
      if (!map[key]) map[key] = { contentName: displayName, contentNo: i.contentNo, imp: 0, clk: 0, buyer: 0, realAmt: 0 }
      map[key].imp    += i.impressions
      map[key].clk    += i.clicks
      map[key].buyer  += i.buyerCnt
      map[key].realAmt+= i.realAmt
    }
    return Object.values(map)
      .map(r => ({ ...r, ctr: r.imp > 0 ? r.clk / r.imp : 0, cvr: r.clk > 0 ? r.buyer / r.clk : 0 }))
      .sort((a, b) => b.realAmt - a.realAmt)
      .slice(0, 30)
  }, [items])

  // 매체별 집계
  const mediaRows = useMemo(() => {
    const map = {}
    for (const i of items) {
      const k = i.media || '기타'
      if (!map[k]) map[k] = { media: k, imp: 0, clk: 0, buyer: 0, realAmt: 0 }
      map[k].imp    += i.impressions
      map[k].clk    += i.clicks
      map[k].buyer  += i.buyerCnt
      map[k].realAmt+= i.realAmt
    }
    return Object.values(map)
      .map(r => ({ ...r, ctr: r.imp > 0 ? r.clk / r.imp : 0 }))
      .sort((a, b) => b.realAmt - a.realAmt)
  }, [items])

  const maxCornerAmt = Math.max(...cornerRows.map(r => r.realAmt), 1)
  const maxContentAmt = Math.max(...contentRows.map(r => r.realAmt), 1)

  // 코너 단위 사전 집계 데이터는 상품(컨텐츠) 식별자가 없다 → 상품별 표는 숨긴다.
  const hasContentDetail = items.some(i => i.contentNo)

  return (
    <div style={{ background: '#F0F6FF', border: '1.5px solid #BFDBFE', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '20px 24px', marginBottom: 16 }}>
      {/* 항목 수 표시 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: '0.75rem', color: '#6B6B68', background: '#fff', borderRadius: 10, padding: '2px 8px', border: '1px solid #BFDBFE' }}>
          총 {items.length.toLocaleString()}개 항목 기준
        </span>
      </div>

      {/* KPI 카드 4개 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard icon="👁" label="총 노출수" value={fmtComma(agg.imp)} color="#6B6B68" />
        <KpiCard icon="👆" label="총 클릭수" value={fmtComma(agg.clk)} sub={`CTR ${fmtCTR(agg.ctr)}`} color="#378ADD" />
        <KpiCard icon="🛒" label="구매전환" value={fmtComma(agg.buyer) + '명'} sub={`전환율 ${fmtPct(agg.cvr)}`} color="#7C3AED" />
        <KpiCard icon="💰" label="실주문금액" value={fmtAmt(agg.realAmt)} color="#1A8060" />
      </div>

      {/* 매체별 미니 바 */}
      <div style={{ marginBottom: 20 }}>
        <SectionTitle>📡 매체별 성과</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mediaRows.map(m => {
            const ratio = agg.imp > 0 ? m.imp / agg.imp : 0
            return (
              <div key={m.media} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', flex: 1, minWidth: 120, border: '1px solid #E8E8E6' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B6B68', marginBottom: 6 }}>{m.media}</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1A1A1A', marginBottom: 2 }}>{fmtAmt(m.realAmt)}</div>
                <div style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>노출 {fmtComma(m.imp)} · CTR {fmtCTR(m.ctr)}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#E8E8E6' }}>
                  <div style={{ width: `${ratio * 100}%`, height: '100%', background: '#378ADD', borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 코너별 + 상품별 2열 (상품 식별자 없으면 코너별만 전체폭) */}
      <div style={{ display: 'grid', gridTemplateColumns: hasContentDetail ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* 코너별 효율 */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px' }}>
          <SectionTitle>📍 코너별 효율 (매출 순)</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E8E6' }}>
                {['코너명', '노출', '클릭', 'CTR', '실주문금액'].map(h => (
                  <th key={h} style={{ padding: '5px 6px', textAlign: h === '코너명' ? 'left' : 'right', color: '#6B6B68', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cornerRows.slice(0, 15).map((r, idx) => {
                const ratio = r.realAmt / maxCornerAmt
                return (
                  <tr key={r.cornerName} style={{ borderBottom: '1px solid #F0F0EE', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '5px 6px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1A1A1A' }} title={r.cornerName}>{r.cornerName}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(r.imp)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(r.clk)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: r.ctr > 0.03 ? '#1A8060' : '#6B6B68', fontWeight: r.ctr > 0.03 ? 600 : 400 }}>{fmtCTR(r.ctr)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', background: heatBg(ratio), fontWeight: 600 }}>{fmtAmt(r.realAmt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 상품별 기여도 (코너 단위 집계 데이터에는 상품 정보가 없어 숨김) */}
        {hasContentDetail && (
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px' }}>
          <SectionTitle>🛍 상품별 기여도 TOP 30</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E8E6' }}>
                {['상품명', '클릭', 'CTR', '실주문금액', '비중'].map(h => (
                  <th key={h} style={{ padding: '5px 6px', textAlign: h === '상품명' ? 'left' : 'right', color: '#6B6B68', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contentRows.map((r, idx) => {
                const ratio = r.realAmt / maxContentAmt
                const share = agg.realAmt > 0 ? r.realAmt / agg.realAmt : 0
                return (
                  <tr key={r.contentNo || idx} style={{ borderBottom: '1px solid #F0F0EE', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '5px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1A1A1A' }} title={r.contentName}>{r.contentName}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(r.clk)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: r.ctr > 0.03 ? '#1A8060' : '#6B6B68' }}>{fmtCTR(r.ctr)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', background: heatBg(ratio), fontWeight: 600 }}>{fmtAmt(r.realAmt)}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#6B6B68' }}>{fmtPct(share)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function L4_ExhibitionAnalysis({ storeCorner }) {
  const [activeGroup, setActiveGroup] = useState('기획전매장')
  const [mediaFilter, setMediaFilter] = useState('ALL')
  const [selectedKey, setSelectedKey] = useState(null)
  const drilldownRef = useRef(null)

  // 행 클릭 시 드릴다운 패널로 부드럽게 스크롤
  useEffect(() => {
    if (selectedKey && drilldownRef.current) {
      setTimeout(() => {
        drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)  // 렌더 후 살짝 딜레이
    }
  }, [selectedKey])

  const items = storeCorner?.items || []
  const period = storeCorner?.period || ''

  // 1단계: 매체 필터
  const mediaFiltered = useMemo(() => (
    mediaFilter === 'ALL' ? items : items.filter(i => i.media === mediaFilter)
  ), [items, mediaFilter])

  // 2단계: 매장그룹 필터
  const groupFiltered = useMemo(() => (
    activeGroup === 'ALL' ? mediaFiltered : mediaFiltered.filter(i => i.storeGroup === activeGroup)
  ), [mediaFiltered, activeGroup])

  // 3단계: 구역별 집계 (기준 key = 매장상세명, 단 ALL이면 매장그룹)
  const keyField = activeGroup === 'ALL' ? 'storeGroup' : 'detailName'

  const summaryRows = useMemo(() => {
    const map = {}
    for (const i of groupFiltered) {
      const key = i[keyField] || '(미분류)'
      if (!map[key]) map[key] = { [keyField]: key, imp: 0, clk: 0, buyer: 0, order: 0, orderAmt: 0, realAmt: 0 }
      map[key].imp     += i.impressions
      map[key].clk     += i.clicks
      map[key].buyer   += i.buyerCnt
      map[key].order   += i.orderCnt
      map[key].orderAmt+= i.impressions  // 주문금액 대신 임시로
      map[key].realAmt += i.realAmt
    }
    // orderAmt 재집계 (주문금액 없으므로 실주문금액과 동일하게)
    return Object.values(map)
      .map(r => ({ ...r, orderAmt: r.realAmt, ctr: r.imp > 0 ? r.clk / r.imp : 0, cvr: r.clk > 0 ? r.buyer / r.clk : 0 }))
      .sort((a, b) => b.realAmt - a.realAmt)
  }, [groupFiltered, keyField])

  // 드릴다운 대상 아이템
  const drillItems = useMemo(() => (
    selectedKey ? groupFiltered.filter(i => i[keyField] === selectedKey) : []
  ), [groupFiltered, selectedKey, keyField])

  // 전체 합계
  const totalAgg = useMemo(() => aggregate(groupFiltered), [groupFiltered])

  // 데이터 없을 때
  if (!storeCorner || items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: '#A0A09E' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎪</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#6B6B68', marginBottom: 8 }}>매장 코너 실적 파일을 업로드해주세요</div>
        <div style={{ fontSize: '0.875rem' }}>헤더에 "코너번호" 또는 "매장상세명" 컬럼이 포함된 파일을 업로드하면 분석이 시작됩니다</div>
      </div>
    )
  }

  return (
    <div>
      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 6 }}>
            🎪 기획전 &amp; 구역별 효율 분석
          </h2>
          {period && <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginTop: 2 }}>기간: {period}</div>}
        </div>
        {/* 매체 필터 */}
        <div style={{ display: 'flex', gap: 4, background: '#F8F8F7', borderRadius: 20, padding: 3 }}>
          {MEDIA_OPTIONS.map(m => (
            <button key={m.id} onClick={() => setMediaFilter(m.id)} style={{
              padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600,
              background: mediaFilter === m.id ? '#378ADD' : 'transparent',
              color: mediaFilter === m.id ? '#fff' : '#6B6B68',
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 매장그룹 탭 ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {GROUP_OPTIONS.map(g => {
          const cnt = (g.id === 'ALL' ? items : items.filter(i => i.storeGroup === g.id)).length
          const isActive = activeGroup === g.id
          return (
            <button key={g.id}
              onClick={() => { setActiveGroup(g.id); setSelectedKey(null) }}
              style={{
                padding: '7px 16px', borderRadius: 20,
                border: `1px solid ${isActive ? '#378ADD' : '#E8E8E6'}`,
                background: isActive ? '#EFF6FF' : '#fff',
                color: isActive ? '#1D4ED8' : '#6B6B68',
                fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
              {g.label}
              <span style={{ fontSize: '0.6875rem', background: isActive ? '#BFDBFE' : '#F0F0EE', borderRadius: 10, padding: '1px 6px', color: isActive ? '#1D4ED8' : '#A0A09E' }}>
                {cnt.toLocaleString()}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── 전체 요약 KPI ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard icon="👁" label="총 노출" value={fmtComma(totalAgg.imp)} color="#6B6B68" />
        <KpiCard icon="👆" label="총 클릭" value={fmtComma(totalAgg.clk)} sub={`CTR ${fmtCTR(totalAgg.ctr)}`} color="#378ADD" />
        <KpiCard icon="🛒" label="구매전환" value={fmtComma(totalAgg.buyer) + '명'} sub={`전환율 ${fmtPct(totalAgg.cvr)}`} color="#7C3AED" />
        <KpiCard icon="💰" label="실주문금액" value={fmtAmt(totalAgg.realAmt)} color="#1A8060" />
        <KpiCard icon="📌" label="구역 수" value={`${summaryRows.length}개`} color="#B45309" />
      </div>

      {/* ── 전체 기획전(구역) 리스트 ── */}
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E8E8E6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1A1A1A' }}>
            {activeGroup === 'ALL' ? '매장그룹별 성과' : `${GROUP_OPTIONS.find(g => g.id === activeGroup)?.label ?? activeGroup} 성과`}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#A0A09E' }}>행 클릭 → 상세 분석</span>
        </div>
        <ExhibitionTable
          rows={summaryRows}
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedKey(key)}
          keyField={keyField}
        />
      </div>

      {/* ── 드릴다운 패널 ── */}
      {selectedKey && drillItems.length > 0 && (
        <div ref={drilldownRef} style={{ scrollMarginTop: 80 }}>
          {/* 상단 연결 안내 배너 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#EFF6FF', border: '1px solid #BFDBFE',
            borderRadius: '10px 10px 0 0', padding: '10px 20px',
            borderBottom: 'none',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#6B6B68' }}>📌 선택된 구역</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1D4ED8' }}>{selectedKey}</span>
            <button
              onClick={() => setSelectedKey(null)}
              style={{
                marginLeft: 'auto', padding: '3px 10px', borderRadius: 12,
                border: '1px solid #BFDBFE', background: '#fff',
                color: '#6B6B68', fontSize: '0.75rem', cursor: 'pointer',
              }}
            >
              ✕ 닫기
            </button>
          </div>
          <DrilldownPanel title={selectedKey} items={drillItems} />
        </div>
      )}
    </div>
  )
}
