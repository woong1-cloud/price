import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, LabelList, PieChart, Pie, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { parseStyleCode } from '../utils/styleCodeParser'
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'
import { heatColor } from './common/HeatCell'
import WoWBadge from './common/WoWBadge'

const PALETTE = ['#378ADD', '#5DCAA5', '#7F77DD', '#EF9F27', '#E24B4A', '#B4B2A9', '#1A8060', '#B45309']
const GENDER_COLOR = { '여성': '#7F77DD', '남성': '#378ADD', '공용': '#5DCAA5', '키즈': '#EF9F27', '콜라보': '#E24B4A' }

function SectionHeader({ icon, title, badge, color = '#378ADD', perspective }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ width: 3, height: 16, background: color, borderRadius: 2, display: 'inline-block' }} />
      {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
      <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1A1A1A' }}>{title}</span>
      {badge && <span style={{ fontSize: '0.75rem', color: '#A0A09E', fontWeight: 400 }}>{badge}</span>}
      {perspective && (
        <span style={{ marginLeft: 'auto', fontSize: '0.625rem', fontWeight: 700,
          background: { MD: '#FFF9F0', 운영: '#F0FDF8', 사용자: '#EFF6FF' }[perspective] || '#F8F8F7',
          color: { MD: '#B45309', 운영: '#1A8060', 사용자: '#1D4ED8' }[perspective] || '#6B6B68',
          border: `1px solid ${{ MD: '#FDE68A', 운영: '#BBF7D0', 사용자: '#BFDBFE' }[perspective] || '#E8E8E6'}`,
          borderRadius: 4, padding: '2px 7px',
        }}>
          {perspective} 관점
        </span>
      )}
    </div>
  )
}

// ─── 스타일코드 미매칭 경고 배너 ────────────────────────────────────────────
function CoverageBanner({ matchedRate, unmatchedCodes }) {
  if (matchedRate >= 80) return null
  return (
    <div style={{
      background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 10,
      padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>⚠️</span>
      <div>
        <div style={{ fontWeight: 700, color: '#B45309', fontSize: '0.875rem', marginBottom: 4 }}>
          스타일코드 매칭률 {matchedRate}% — ITEM_CODE_TABLE 업데이트 필요
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#92400E' }}>
          미매칭 코드: {unmatchedCodes.join(' · ')}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginTop: 4 }}>
          styleCodeParser.js의 ITEM_CODE_TABLE에 품목코드를 추가하면 카테고리/성별 분석 정확도가 높아집니다.
        </div>
      </div>
    </div>
  )
}

// ─── 전주 대비(WoW) 셀 ───────────────────────────────────────────────────────
function WoWCell({ wow }) {
  return <WoWBadge wow={wow} showNew size="xs" />
}

// ─── 1. 상품 Top 50 탭 (20개 노출 + 펼치기, 전주 대비 WoW) ───────────────────
const VISIBLE_ROWS = 20

function ProductTable({ rows, valueKey, valueLabel, valueFormatter, hasWoW }) {
  const [expanded, setExpanded] = useState(false)
  const maxVal = rows.length > 0 ? rows[0][valueKey] : 1
  if (rows.length === 0) return <div style={{ textAlign: 'center', color: '#A0A09E', padding: '24px 0', fontSize: '0.875rem' }}>데이터 없음</div>

  const visibleRows = expanded ? rows : rows.slice(0, VISIBLE_ROWS)
  const hiddenCount = rows.length - VISIBLE_ROWS
  const headers = ['#', '스타일코드', '상품명', '품목', '성별', '시즌', valueLabel]
  if (hasWoW) headers.push('전주 대비')

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
            {headers.map((h, i) => (
              <th key={h} style={{ padding: '8px 10px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, i) => {
            const parsed = parseStyleCode(r.styleCode)
            const ratio  = maxVal > 0 ? r[valueKey] / maxVal : 0
            const gColor = GENDER_COLOR[parsed.gender] || '#B4B2A9'
            return (
              <tr key={i} style={{ borderBottom: '1px solid #F0F0EE' }}>
                <td style={{ padding: '8px 10px', color: i < 3 ? '#EF9F27' : '#A0A09E', fontWeight: i < 3 ? 700 : 400 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#6B6B68' }}>{r.styleCode || '—'}</td>
                <td style={{ padding: '8px 10px', color: '#1A1A1A', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <span style={{ background: '#F0F0EE', borderRadius: 4, padding: '2px 7px', fontSize: '0.6875rem', color: '#6B6B68' }}>{parsed.itemName}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{ background: `${gColor}18`, borderRadius: 4, padding: '2px 7px', fontSize: '0.6875rem', color: gColor, fontWeight: 600 }}>{parsed.gender}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: parsed.isNew ? '#1A8060' : '#A0A09E', background: parsed.isNew ? '#F0FDF8' : '#F8F8F7', borderRadius: 4, padding: '2px 6px' }}>
                    {parsed.isNew ? '신상' : parsed.yearCode === 'F' ? '이월' : '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{ background: heatColor(ratio * 0.7), borderRadius: 5, padding: '3px 10px', fontWeight: 700, color: ratio > 0.55 ? '#fff' : '#1A1A1A' }}>
                    {valueFormatter(r[valueKey])}
                  </span>
                </td>
                {hasWoW && (
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <WoWCell wow={r.wow} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button onClick={() => setExpanded(e => !e)} style={{
            padding: '7px 20px', borderRadius: 20, border: '1px solid #E8E8E6',
            background: expanded ? '#F8F8F7' : '#EFF6FF',
            color: expanded ? '#6B6B68' : '#1D4ED8',
            fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
          }}>
            {expanded ? '▲ 접기 (상위 20개만 보기)' : `▼ 나머지 ${hiddenCount}개 더 보기 (Top ${rows.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

function ProductTabs({ salesTop15, wishTop15, cartTop15, hasWoW }) {
  const [active, setActive] = useState('sales')
  const tabs = [
    { id: 'sales', label: '판매 Top 50',      data: salesTop15, valueKey: 'realAmt', valueLabel: '실주문금액', fmt: fmt억 },
    { id: 'wish',  label: '관심(찜) Top 50',  data: wishTop15,  valueKey: 'wishCnt', valueLabel: '찜수',       fmt: v => fmtComma(v) + '건' },
    { id: 'cart',  label: '장바구니 Top 50',  data: cartTop15,  valueKey: 'cartCnt', valueLabel: '담기수',     fmt: v => fmtComma(v) + '건' },
  ]
  const cur = tabs.find(t => t.id === active)

  return (
    <div className="card p-5">
      <SectionHeader icon="📋" title="상품 실적 Top 50" perspective="MD" color="#EF9F27"
        badge={hasWoW ? '상위 20개 노출 · 펼치면 50위까지 · 전주 대비 WoW' : '상위 20개 노출 · 펼치면 50위까지'} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600,
            fontSize: '0.8125rem',
            background: active === t.id ? '#378ADD' : '#F0F0EE',
            color: active === t.id ? '#fff' : '#6B6B68',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      <ProductTable key={active} rows={cur.data} valueKey={cur.valueKey} valueLabel={cur.valueLabel} valueFormatter={cur.fmt} hasWoW={hasWoW} />
    </div>
  )
}

// ─── 2. 신상 vs 이월 비교 ────────────────────────────────────────────────────
function NewVsCarrySection({ newVsCarry }) {
  if (!newVsCarry || newVsCarry.every(d => d.realAmt === 0)) return null
  const total = newVsCarry.reduce((s, d) => s + d.realAmt, 0) || 1
  const colors = ['#5DCAA5', '#B4B2A9']

  return (
    <div className="card p-5">
      <SectionHeader icon="🆕" title="신상 vs 이월 시즌 비교" perspective="MD" color="#5DCAA5"
        badge="스타일코드 연도코드 G=신상 / F=이월" />
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center' }}>
        {/* 파이 */}
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={newVsCarry} cx="50%" cy="50%" outerRadius={70} innerRadius={36} dataKey="realAmt">
              {newVsCarry.map((d, i) => <Cell key={d.name} fill={colors[i]} />)}
            </Pie>
            <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
          </PieChart>
        </ResponsiveContainer>
        {/* 상세 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {newVsCarry.map((d, i) => (
            <div key={d.name} style={{ background: i === 0 ? '#F0FDF8' : '#F8F8F7', borderRadius: 10, padding: '14px 18px', border: `1px solid ${colors[i]}44` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: colors[i] }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: colors[i] }}>{d.name}</span>
                {i === 0 && <span style={{ fontSize: '0.6875rem', background: '#5DCAA5', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>이번 시즌 주력</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>실주문금액</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1A1A1A' }}>{fmt억(d.realAmt)}</span>
                    <WoWBadge wow={d.wow} size="xs" suffix="vs 전주" />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>매출 비중</div>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: colors[i] }}>{d.pct.toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>취급 SKU</div>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#6B6B68' }}>{d.skuCount}개</div>
                </div>
              </div>
              {/* 비율 바 */}
              <div style={{ height: 6, background: '#E8E8E6', borderRadius: 3, marginTop: 10 }}>
                <div style={{ height: '100%', width: `${d.pct}%`, background: colors[i], borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: '0.75rem', color: '#A0A09E', padding: '6px 0' }}>
            💡 신상 비중이 낮으면 이월 재고 소진 전략을, 높으면 신상 MD 강화를 검토하세요.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 3. 파레토 분석 (상품 집중도) ───────────────────────────────────────────
function ParetoSection({ pareto }) {
  if (!pareto || pareto.total === 0) return null
  const { count80, total, pct80, top10, count80Wow } = pareto
  const maxPct = top10[0]?.pct || 1

  return (
    <div className="card p-5">
      <SectionHeader icon="📐" title="매출 집중도 (파레토 분석)" perspective="MD" color="#7F77DD" />
      {/* 헤드라인 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
        <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '14px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.6875rem', color: '#7F77DD', fontWeight: 600, marginBottom: 4 }}>매출 80% 커버 SKU 수</div>
          <div style={{ fontWeight: 800, fontSize: '2rem', color: '#7F77DD' }}>{count80}<span style={{ fontSize: '1rem' }}>개</span></div>
          <div style={{ fontSize: '0.75rem', color: '#A0A09E' }}>전체 {total}개 중 {pct80}%</div>
          {count80Wow !== null && count80Wow !== undefined && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
              <WoWBadge wow={count80Wow} size="xs" suffix="vs 전주" />
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          {pct80 <= 20 ? (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: '0.8125rem', color: '#DC2626' }}>
              ⚠ 극도로 집중된 구조 — 상위 {pct80}% 상품이 매출 80% 담당. 단종 리스크 높음.
            </div>
          ) : pct80 <= 30 ? (
            <div style={{ background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: '0.8125rem', color: '#B45309' }}>
              ⚠ 집중 구조 — 매출이 소수 상품에 편중되어 있습니다. 신규 히트 상품 발굴을 권장합니다.
            </div>
          ) : (
            <div style={{ background: '#F0FDF8', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: '0.8125rem', color: '#1A8060' }}>
              ✓ 분산 구조 — 다양한 상품이 고르게 매출에 기여하고 있습니다.
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: '#A0A09E' }}>
            💡 집중도가 높을수록 주력 상품 재고·품질 관리가 중요합니다.
          </div>
        </div>
      </div>

      {/* Top 10 상품 기여도 */}
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 8 }}>상위 10개 상품 매출 기여 (누적)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top10.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 20, fontSize: '0.6875rem', color: '#A0A09E', flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <span style={{ fontSize: '0.75rem', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                  {p.name || p.styleCode || '—'}
                </span>
                <span style={{ fontSize: '0.625rem', color: '#A0A09E', flexShrink: 0 }}>단독 {p.pct}%</span>
              </div>
              <div style={{ height: 6, background: '#F0F0EE', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${p.pct / maxPct * 100}%`, background: heatColor((p.pct / maxPct) * 0.8), borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A1A' }}>{fmt억(p.realAmt)}</span>
              <WoWBadge wow={p.wow} size="xs" />
              <span style={{ fontSize: '0.625rem', background: '#F5F3FF', color: '#7F77DD', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>누적 {p.cumPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 4. 카테고리별 찜→담기→판매 퍼널 ─────────────────────────────────────────
function CategoryFunnelSection({ catFunnel }) {
  if (!catFunnel || catFunnel.length === 0) return null
  const maxAmt = Math.max(...catFunnel.map(d => d.realAmt), 1)

  return (
    <div className="card p-5">
      <SectionHeader icon="🔄" title="카테고리별 관심→담기→판매 퍼널" perspective="MD" color="#EF9F27"
        badge="카테고리 분류 기준: 상품명 키워드" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
              {['카테고리', '관심(찜)', '장바구니', '실주문금액', '전주 대비', '전환 강도'].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catFunnel.map((d, i) => {
              const ratio = d.realAmt / maxAmt
              const barW  = Math.max(4, ratio * 100)
              // 전환 강도: 실매출 / (찜+담기) 높을수록 효율적
              const interest = (d.wishCnt || 0) + (d.cartCnt || 0)
              const convStrength = interest > 0 ? (d.realAmt / interest / 10000).toFixed(1) : '—'
              return (
                <tr key={d.name} style={{ borderBottom: '1px solid #F0F0EE' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1A1A1A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length] }} />
                      {d.name}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#7F77DD', fontWeight: 600 }}>
                    {d.wishCnt > 0 ? fmtComma(d.wishCnt) + '건' : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#5DCAA5', fontWeight: 600 }}>
                    {d.cartCnt > 0 ? fmtComma(d.cartCnt) + '건' : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: `${barW}px`, height: 6, background: heatColor(ratio * 0.85), borderRadius: 3 }} />
                      <span style={{ fontWeight: 700, color: '#1A1A1A', minWidth: 48 }}>{fmt억(d.realAmt)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}><WoWBadge wow={d.wow} size="xs" /></div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {convStrength !== '—' ? (
                      <span style={{ background: '#FFF9F0', color: '#B45309', borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {convStrength}만원/건
                      </span>
                    ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#A0A09E' }}>
        💡 전환 강도 = 실주문금액 ÷ (찜+담기) — 높을수록 관심 대비 구매 전환이 효율적입니다.
      </div>
    </div>
  )
}

// ─── 5. PV 갭 리스트 ─────────────────────────────────────────────────────────
function PVGapTable({ pvGapList }) {
  if (!pvGapList || pvGapList.length === 0) return null
  return (
    <div className="card p-5">
      <SectionHeader icon="👁" title="PV 대비 전환 미흡 상품" perspective="운영" color="#E24B4A"
        badge="PV 점유 높은데 매출 점유 낮은 상품 — 상세페이지 개선 필요" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
            {['#', '상품명', 'PV 점유', '매출 점유', '갭 (전환 개선 필요)'].map((h, i) => (
              <th key={h} style={{ padding: '8px 10px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pvGapList.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F0F0EE' }}>
              <td style={{ padding: '8px 10px', color: '#A0A09E', width: 28 }}>{i + 1}</td>
              <td style={{ padding: '8px 10px', color: '#1A1A1A', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name || r.styleCode || '—'}
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6B6B68' }}>{r.pvShare.toFixed(1)}%</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6B6B68' }}>{r.amtShare.toFixed(1)}%</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                <span style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 5, padding: '3px 10px', fontWeight: 700, fontSize: '0.75rem' }}>
                  +{r.gap.toFixed(1)}%p
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#A0A09E' }}>
        💡 갭이 큰 상품은 <strong>상세페이지 품질(이미지·가격·리뷰)</strong> 또는 <strong>재고 결품 여부</strong>도 함께 확인하세요. 결품 상품은 PV가 높아도 전환이 불가능합니다.
      </div>
    </div>
  )
}

// ─── 6. 성별(타겟)×카테고리 크로스 분석 ─────────────────────────────────────
function GenderCategorySection({ genderCatData, topCatsForCross }) {
  if (!genderCatData || genderCatData.length === 0 || !topCatsForCross?.length) return null
  const maxAmt = Math.max(...genderCatData.flatMap(g => g.cats.map(c => c.realAmt)), 1)

  return (
    <div className="card p-5">
      <SectionHeader icon="👗👔" title="타겟 성별 × 카테고리 크로스 분석" perspective="MD" color="#378ADD"
        badge="스타일코드 성별코드 기준" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6B6B68', fontWeight: 600, fontSize: '0.8125rem', width: 80 }}>성별</th>
              {topCatsForCross.map(cat => (
                <th key={cat} style={{ padding: '8px 8px', textAlign: 'center', color: '#6B6B68', fontWeight: 600, fontSize: '0.75rem' }}>{cat}</th>
              ))}
              <th style={{ padding: '8px 8px', textAlign: 'right', color: '#6B6B68', fontWeight: 600, fontSize: '0.75rem' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {genderCatData.map(row => {
              const gColor = GENDER_COLOR[row.gender] || '#B4B2A9'
              return (
                <tr key={row.gender}>
                  <td style={{ padding: '6px 12px', fontWeight: 700, color: gColor }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: gColor }} />
                      {row.gender}
                    </div>
                  </td>
                  {row.cats.map(c => {
                    const ratio = c.realAmt / maxAmt
                    const bg = heatColor(ratio * 0.85)
                    const textColor = ratio > 0.55 ? '#fff' : '#1A1A1A'
                    return (
                      <td key={c.cat} style={{ padding: 3 }}>
                        <div style={{ background: bg, borderRadius: 6, padding: '8px 6px', textAlign: 'center', minWidth: 80 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: textColor }}>{fmt억(c.realAmt)}</div>
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1A1A1A' }}>
                    {fmt억(row.total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#A0A09E' }}>
        💡 셀 색이 진할수록 해당 성별×카테고리 조합의 실주문금액이 높습니다. MD 집중 전략에 활용하세요.
      </div>
    </div>
  )
}

// ─── 7. IP 콜라보 차트 ───────────────────────────────────────────────────────
function IPChart({ ipData }) {
  if (!ipData || ipData.length === 0) return null
  const total = ipData.reduce((s, d) => s + d.realAmt, 0)
  return (
    <div className="card p-5">
      <SectionHeader icon="⭐" title="IP / 콜라보 상품 실적" perspective="MD" color="#EF9F27" />
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={ipData} cx="50%" cy="50%" outerRadius={70} innerRadius={32} dataKey="realAmt">
              {ipData.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {ipData.map((d, i) => {
            const pct = total > 0 ? d.realAmt / total * 100 : 0
            return (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <span style={{ fontSize: '0.8125rem', color: '#6B6B68', flex: 1 }}>{d.name}</span>
                <div style={{ width: 80, height: 6, background: '#F0F0EE', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: PALETTE[i % PALETTE.length], borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A1A', minWidth: 40, textAlign: 'right' }}>{fmt억(d.realAmt)}</span>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E', minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                <span style={{ minWidth: 52, textAlign: 'right' }}><WoWBadge wow={d.wow} size="xs" /></span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── 8. 카테고리 차트 ────────────────────────────────────────────────────────
function CatChart({ catData }) {
  if (!catData || catData.length === 0) return null
  const max = catData[0]?.realAmt || 1
  return (
    <div className="card p-5">
      <SectionHeader icon="📦" title="카테고리별 실주문금액" perspective="MD" color="#7F77DD" />
      <ResponsiveContainer width="100%" height={Math.max(200, catData.length * 36)}>
        <BarChart data={catData} layout="vertical" margin={{ left: 8, right: 80, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F0EE" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
          <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
          <Bar dataKey="realAmt" radius={[0, 6, 6, 0]}>
            {catData.map((d, i) => (
              <Cell key={d.name} fill={heatColor((catData.length - i) / catData.length * 0.9)} />
            ))}
            <LabelList dataKey="realAmt" position="right" formatter={v => fmt억(v)} style={{ fontSize: 11, fill: '#6B6B68' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* 카테고리별 전주 대비 */}
      {catData.some(d => d.wow !== null && d.wow !== undefined) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 12, borderTop: '1px solid #F0F0EE' }}>
          {catData.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F8F8F7', borderRadius: 6, padding: '3px 8px' }}>
              <span style={{ fontSize: '0.6875rem', color: '#6B6B68' }}>{d.name}</span>
              <WoWBadge wow={d.wow} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 아이템×성별 복종 실적 테이블 ───────────────────────────────────────────────
const IG_COLS = ['여성', '남성', '키즈', '공용', '콜라보', '기타']

function ItemGenderTable({ itemGenderMatrix, itemGenderColWow }) {
  if (!itemGenderMatrix || itemGenderMatrix.length === 0) return null
  const maxVal = Math.max(...itemGenderMatrix.map(r => r.total), 1)

  const cellStyle = (val) => {
    const ratio = maxVal > 0 ? Math.min(val / maxVal, 1) : 0
    return {
      textAlign: 'right',
      padding: '5px 10px',
      fontSize: '0.75rem',
      color: val > 0 ? (ratio > 0.6 ? '#fff' : '#1A1A1A') : '#C4C4C0',
      background: val > 0 ? heatColor(ratio) : 'transparent',
    }
  }

  // 성별 열 합계 계산
  const colTotals = {}
  let grandTotal = 0
  for (const g of [...IG_COLS]) {
    colTotals[g] = itemGenderMatrix.reduce((s, r) => s + (r[g] || 0), 0)
    grandTotal += colTotals[g]
  }
  const totalSkuCount = itemGenderMatrix.reduce((s, r) => s + r.skuCount, 0)

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '20px 22px', border: '1px solid #E8E8E6' }}>
      <SectionHeader icon="📊" title="아이템×성별 복종 실적" color="#7F77DD" perspective="MD" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ background: '#F8F8F7' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: '1px solid #E8E8E6' }}>품목명</th>
              {IG_COLS.map(g => (
                <th key={g} style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, borderBottom: '1px solid #E8E8E6', color: GENDER_COLOR[g] || '#6B6B68' }}>{g}</th>
              ))}
              <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, borderBottom: '1px solid #E8E8E6', color: '#378ADD', background: '#EFF6FF' }}>합계</th>
              <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, borderBottom: '1px solid #E8E8E6', color: '#6B6B68' }}>전주 대비</th>
              <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, borderBottom: '1px solid #E8E8E6', color: '#6B6B68' }}>SKU수</th>
            </tr>
          </thead>
          <tbody>
            {/* 합계 행 — 상단 고정 */}
            <tr style={{ borderBottom: '2px solid #E8E8E6', background: '#F0F4FF' }}>
              <td style={{ padding: '7px 10px', fontWeight: 700, fontSize: '0.8125rem', color: '#1A1A1A' }}>전체 합계</td>
              {IG_COLS.map(g => {
                const pct = grandTotal > 0 ? (colTotals[g] / grandTotal * 100).toFixed(1) : '0.0'
                return (
                  <td key={g} style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 700, fontSize: '0.75rem', color: colTotals[g] > 0 ? (GENDER_COLOR[g] || '#1A1A1A') : '#C4C4C0' }}>
                    {colTotals[g] > 0 ? (
                      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        {fmt억(colTotals[g])}
                        <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: '#6B6B68' }}>{pct}%</span>
                        {itemGenderColWow?.[g] !== null && itemGenderColWow?.[g] !== undefined && (
                          <WoWBadge wow={itemGenderColWow[g]} size="xs" />
                        )}
                      </span>
                    ) : '—'}
                  </td>
                )
              })}
              <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 700, fontSize: '0.8125rem', color: '#378ADD', background: '#EFF6FF' }}>
                {fmt억(grandTotal)}
              </td>
              <td style={{ textAlign: 'right', padding: '7px 10px' }} />
              <td style={{ textAlign: 'right', padding: '7px 10px', color: '#6B6B68', fontSize: '0.75rem' }}>
                {totalSkuCount}개
              </td>
            </tr>
            {itemGenderMatrix.map((row, i) => (
              <tr key={row.itemName} style={{ borderBottom: '1px solid #F0F0EE', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: '0.8125rem' }}>{row.itemName}</td>
                {IG_COLS.map(g => (
                  <td key={g} style={cellStyle(row[g])}>
                    {row[g] > 0 ? fmt억(row[g]) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '5px 10px', fontWeight: 700, fontSize: '0.8125rem', color: '#378ADD', background: '#EFF6FF' }}>
                  {fmt억(row.total)}
                </td>
                <td style={{ textAlign: 'right', padding: '5px 10px' }}>
                  <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}><WoWBadge wow={row.totalWow} size="xs" /></div>
                </td>
                <td style={{ textAlign: 'right', padding: '5px 10px', color: '#6B6B68', fontSize: '0.75rem' }}>
                  {row.skuCount}개
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── L2 메인 ─────────────────────────────────────────────────────────────────
// ─── 재입고 대기 수요 (품절 기회손실) ────────────────────────────────────────
function cleanName(name) {
  return String(name).replace(/_[A-Za-z0-9]+\s*$/, '')
}

function SizeBar({ sizes }) {
  const entries = Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = entries[0]?.[1] || 1
  if (entries.length === 0) return <span style={{ color: '#C8C8C6', fontSize: '0.6875rem' }}>—</span>
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
      {entries.map(([size, cnt]) => (
        <div key={size} style={{ textAlign: 'center', minWidth: 22 }}>
          <div title={`${size}: ${cnt}건`} style={{
            height: Math.max(4, Math.round(cnt / max * 28)), background: '#7F77DD',
            borderRadius: 2, opacity: 0.45 + 0.55 * (cnt / max),
          }} />
          <div style={{ fontSize: '0.5625rem', color: '#A0A09E', marginTop: 2 }}>{size}</div>
        </div>
      ))}
    </div>
  )
}

const CONV_OPTIONS = [0.1, 0.2, 0.3]

function RestockSection({ restockMetrics, hasWoW }) {
  const [expanded, setExpanded] = useState(false)
  const [cls, setCls] = useState('all')      // all | collab | apparel
  const [ipFilter, setIpFilter] = useState(null)
  const [conv, setConv] = useState(0.3)      // 예상매출 가정 전환율
  if (!restockMetrics?.products?.length) return null
  const { products, crossHot, topSizes, summary, classSummary, ipSummary = [], estBaseAll = 0, priceCoverage } = restockMetrics

  let filtered = cls === 'collab'  ? products.filter(p => p.isCollab)
               : cls === 'apparel' ? products.filter(p => !p.isCollab)
               : products
  if (cls === 'collab' && ipFilter) filtered = filtered.filter(p => p.ip === ipFilter)
  const pool = filtered.slice(0, 50)                 // 그룹 내 최대 50개 관리
  const top  = expanded ? pool : pool.slice(0, 20)   // 기본 20개 노출

  const hasPrice = priceCoverage && priceCoverage.overallUnit > 0
  const segs = [
    { id: 'all',     label: '전체',   icon: '📦', color: '#E24B4A', cnt: summary.totalCnt,         productCount: summary.productCount,             wow: summary.totalWoW,         estBase: estBaseAll },
    { id: 'collab',  label: '콜라보', icon: '✨', color: '#7F77DD', cnt: classSummary.collab.cnt,  productCount: classSummary.collab.productCount,  wow: classSummary.collab.wow,  estBase: classSummary.collab.estBase },
    { id: 'apparel', label: '어패럴', icon: '👕', color: '#378ADD', cnt: classSummary.apparel.cnt, productCount: classSummary.apparel.productCount, wow: classSummary.apparel.wow, estBase: classSummary.apparel.estBase },
  ]

  return (
    <div className="card p-5" style={{ borderTop: '3px solid #E24B4A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <SectionHeader icon="🔥" title="재입고 대기 수요 (품절 기회손실)" color="#E24B4A" perspective="MD" />
        <span style={{ fontSize: '0.6875rem', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
          재입고 알림 기준 · 사고 싶었는데 품절
        </span>
      </div>

      {/* 분류 스코어보드 (클릭 = 그룹 필터) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
        {segs.map(s => {
          const active = cls === s.id
          return (
            <button key={s.id} onClick={() => { setCls(s.id); setExpanded(false); setIpFilter(null) }} style={{
              textAlign: 'left', cursor: 'pointer', font: 'inherit',
              background: active ? `${s.color}12` : '#F8F8F7',
              border: `1.5px solid ${active ? s.color : '#F0F0EE'}`,
              boxShadow: active ? `0 1px 6px ${s.color}33` : 'none',
              borderRadius: 10, padding: '12px 14px', transition: 'all .15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.875rem' }}>{s.icon}</span>
                <span style={{ fontSize: '0.75rem', color: active ? s.color : '#6B6B68', fontWeight: 700 }}>{s.label}</span>
                {active && <span style={{ marginLeft: 'auto', fontSize: '0.5625rem', color: s.color, fontWeight: 700 }}>● 선택됨</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '1.375rem', color: s.color }}>
                  {fmtComma(s.cnt)}<span style={{ fontSize: '0.75rem', fontWeight: 600 }}>건</span>
                </span>
                {s.wow !== null && s.wow !== undefined && hasWoW && <WoWBadge wow={s.wow} size="xs" />}
              </div>
              <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 3 }}>상품 {fmtComma(s.productCount)}개</div>
              {hasPrice && (
                <div style={{ fontSize: '0.625rem', color: '#1A8060', marginTop: 5, fontWeight: 600 }}>
                  예상 재입고 매출 ~{fmt억(s.estBase * conv)}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 예상매출 가정 전환율 + 신뢰도 */}
      {hasPrice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, background: '#F0FDF8', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px' }}>
          <span style={{ fontSize: '0.6875rem', color: '#1A8060', fontWeight: 700 }}>💰 예상매출 가정 전환율</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {CONV_OPTIONS.map(c => (
              <button key={c} onClick={() => setConv(c)} style={{
                cursor: 'pointer', font: 'inherit', border: `1px solid ${conv === c ? '#1A8060' : '#BBF7D0'}`,
                background: conv === c ? '#1A8060' : '#fff', color: conv === c ? '#fff' : '#1A8060',
                borderRadius: 6, padding: '3px 10px', fontSize: '0.6875rem', fontWeight: 700,
              }}>{Math.round(c * 100)}%</button>
            ))}
          </div>
          <span style={{ fontSize: '0.625rem', color: '#6B6B68' }}>
            = 대기 고객 중 {Math.round(conv * 100)}%가 재입고 시 구매한다고 가정 · 단가는 판매 실적 기준 추정
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.625rem', color: priceCoverage.pricedCntPct >= 50 ? '#1A8060' : '#B45309', fontWeight: 600 }}>
            가격 커버리지 {priceCoverage.pricedCntPct.toFixed(0)}% (판매 이력 보유 기준)
          </span>
        </div>
      )}

      <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 16 }}>
        카드를 클릭하면 해당 그룹만 정렬됩니다 · 최다 수요 사이즈 {topSizes.slice(0, 3).map(s => `${s.size}(${s.cnt})`).join(' · ') || '—'} · 단품 {fmtComma(summary.skuCount)}개
      </div>

      {/* 콜라보 선택 시: IP별 인기도 + 드릴다운 */}
      {cls === 'collab' && ipSummary.length > 0 && (
        <div style={{ background: '#F8F7FC', border: '1px solid #E5E1F5', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5B4FC4' }}>✨ IP별 재입고 인기도</span>
            <span style={{ fontSize: '0.625rem', color: '#A0A09E' }}>칩을 클릭하면 해당 IP 상품만 정렬됩니다</span>
            {ipFilter && (
              <button onClick={() => { setIpFilter(null); setExpanded(false) }} style={{
                marginLeft: 'auto', cursor: 'pointer', font: 'inherit', border: '1px solid #E5E1F5',
                background: '#fff', color: '#5B4FC4', borderRadius: 6, padding: '2px 8px', fontSize: '0.625rem', fontWeight: 700,
              }}>✕ IP 필터 해제</button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ipSummary.map(ip => {
              const active = ipFilter === ip.ip
              return (
                <button key={ip.ip} onClick={() => { setIpFilter(active ? null : ip.ip); setExpanded(false) }} style={{
                  cursor: 'pointer', font: 'inherit',
                  background: active ? '#5B4FC4' : '#fff',
                  border: `1px solid ${active ? '#5B4FC4' : '#E5E1F5'}`,
                  color: active ? '#fff' : '#1A1A1A',
                  borderRadius: 20, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  {ip.ip}
                  <strong style={{ color: active ? '#fff' : '#5B4FC4' }}>{fmtComma(ip.cnt)}명</strong>
                  <span style={{ fontSize: '0.5625rem', color: active ? '#E5E1F5' : '#A0A09E' }}>{ip.productCount}개</span>
                  {hasWoW && ip.wow !== null && ip.wow !== undefined && <WoWBadge wow={ip.wow} size="xs" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 잘 팔리는데 품절 — 최우선 리오더 하이라이트 */}
      {crossHot.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#B91C1C', marginBottom: 6 }}>
            ⭐ 잘 팔리는데 품절 — 최우선 리오더 {crossHot.length}건
          </div>
          <div style={{ fontSize: '0.75rem', color: '#7F1D1D', lineHeight: 1.6 }}>
            이번 주 <strong>판매가 발생 중인데 재입고 대기까지 걸린 상품</strong>입니다. 재고만 채우면 바로 더 팔 수 있는 명백한 기회손실이에요.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {crossHot.map(p => (
              <span key={p.productNo || p.name} style={{ background: '#fff', border: '1px solid #FECACA', borderRadius: 6, padding: '3px 9px', fontSize: '0.6875rem', color: '#1A1A1A' }}>
                {cleanName(p.name)} <strong style={{ color: '#B91C1C' }}>{fmtComma(p.cnt)}명</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* TOP 상품 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
              {['#', '상품', '품목', '대기건수', hasWoW ? '전주대비' : '', '단품', ...(hasPrice ? ['예상매출'] : []), '사이즈별 수요'].filter(Boolean).map((h, i) => (
                <th key={h + i} style={{ padding: '9px 12px', textAlign: i === 1 ? 'left' : i <= 1 ? 'center' : 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.length === 0 && (
              <tr><td colSpan={(hasWoW ? 7 : 6) + (hasPrice ? 1 : 0)} style={{ padding: '24px 12px', textAlign: 'center', color: '#A0A09E', fontSize: '0.8125rem' }}>
                이 그룹에는 재입고 대기 상품이 없습니다.
              </td></tr>
            )}
            {top.map((p, i) => (
              <tr key={p.productNo || p.name} style={{ borderBottom: '1px solid #F0F0EE', background: p.hot ? '#FFFBFB' : 'transparent' }}>
                <td style={{ padding: '9px 12px', textAlign: 'center', color: '#A0A09E', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.hot && <span title="판매 중인데 품절 — 최우선 리오더" style={{ fontSize: '0.75rem' }}>⭐</span>}
                    <span style={{ fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanName(p.name)}</span>
                  </div>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'center', color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{p.itemName || '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#E24B4A' }}>{fmtComma(p.cnt)}<span style={{ fontSize: '0.6875rem', fontWeight: 500 }}>명</span></td>
                {hasWoW && (
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {p.isNewDemand ? <span style={{ fontSize: '0.625rem', color: '#B45309', fontWeight: 700, background: '#FFF9F0', borderRadius: 4, padding: '1px 6px' }}>신규</span> : <WoWBadge wow={p.wow} size="xs" />}
                  </td>
                )}
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{p.skuCount}</td>
                {hasPrice && (
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: '#1A8060' }}>~{fmt억(p.estBase * conv)}</span>
                    {!p.hasPrice && <span title="판매 이력이 없어 전체 평균단가로 추정" style={{ fontSize: '0.5625rem', color: '#B45309', marginLeft: 4 }}>≈</span>}
                  </td>
                )}
                <td style={{ padding: '9px 12px' }}><div style={{ display: 'flex', justifyContent: 'flex-end' }}><SizeBar sizes={p.sizes} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pool.length > 20 && (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: '#fff', border: '1px solid #E8E8E6', borderRadius: 8,
              padding: '7px 18px', fontSize: '0.75rem', fontWeight: 700, color: '#6B6B68',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {expanded
              ? <>접기 <span style={{ fontSize: '0.625rem' }}>▲</span></>
              : <>더보기 <span style={{ color: '#E24B4A' }}>+{pool.length - 20}개</span> <span style={{ fontSize: '0.625rem' }}>▼</span></>}
          </button>
          <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 5 }}>
            {cls === 'all' ? '전체' : cls === 'collab' ? '콜라보' : '어패럴'} 상위 {pool.length}개 표시{filtered.length > 50 ? ` · 그룹 전체 ${fmtComma(filtered.length)}개 상품` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

export default function L2_ProductAnalysis({ derived }) {
  const {
    matchedRate, unmatchedCodes,
    salesTop15, wishTop15, cartTop15,
    pvGapList, catData, catFunnel, ipData,
    newVsCarry, pareto, genderCatData, topCatsForCross,
    itemGenderMatrix, itemGenderColWow, hasWoW,
    restockMetrics,
  } = derived

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 코드 커버리지 경고 */}
      <CoverageBanner matchedRate={matchedRate} unmatchedCodes={unmatchedCodes} />

      {/* 0. 재입고 대기 수요 (품절 기회손실) — 업로드 시에만 표시 */}
      <RestockSection restockMetrics={restockMetrics} hasWoW={hasWoW} />

      {/* 1. 상품 Top 50 */}
      <ProductTabs salesTop15={salesTop15} wishTop15={wishTop15} cartTop15={cartTop15} hasWoW={hasWoW} />

      {/* 2. 신상 vs 이월 */}
      <NewVsCarrySection newVsCarry={newVsCarry} />

      {/* 3. 파레토 분석 */}
      <ParetoSection pareto={pareto} />

      {/* 4. 카테고리 퍼널 */}
      <CategoryFunnelSection catFunnel={catFunnel} />

      {/* 5. PV 갭 */}
      <PVGapTable pvGapList={pvGapList} />

      {/* 6. 성별×카테고리 크로스 */}
      <GenderCategorySection genderCatData={genderCatData} topCatsForCross={topCatsForCross} />

      {/* 7+8. IP + 카테고리 차트 나란히 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <IPChart ipData={ipData} />
        <CatChart catData={catData} />
      </div>

      {/* 9. 아이템×성별 복종 실적 */}
      <ItemGenderTable itemGenderMatrix={itemGenderMatrix} itemGenderColWow={itemGenderColWow} />
    </div>
  )
}
