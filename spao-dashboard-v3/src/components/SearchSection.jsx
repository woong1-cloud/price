/**
 * SearchSection — 검색 실적 분석 (L1 헬스체크 내 섹션)
 *
 * 구성:
 *  1) 검색 KPI 4개 타일 (검색량, 검색 UV, 주문건수, 검색→구매 전환율)
 *  2) 채널별 검색 성과 (APP/MOBILE/PC)
 *  3) 매출 기여 키워드 Top 15 (주문금액 기준)
 *  4) 기회 키워드 — 검색 多, 주문 0 (상품 노출·CX 개선 필요)
 *  5) 전환율 상위 키워드 Top 10
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts'
import { fmtComma, fmt억 } from '../utils/metrics'
import WoWBadge from './common/WoWBadge'

const MEDIA_COLORS = { APP: '#5DCAA5', MOBILE: '#378ADD', PC: '#B4B2A9' }

// ─── 섹션 헤더 ───────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge, color = '#378ADD' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ width: 3, height: 16, background: color, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
      {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
      <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1A1A1A' }}>{title}</span>
      {badge && (
        <span style={{
          fontSize: '0.6875rem', fontWeight: 600, color, background: `${color}18`,
          border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 10px',
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

// ─── KPI 타일 ────────────────────────────────────────────────────────────────
function KPITile({ label, value, sub, color = '#378ADD', icon, wow, wowKind = 'pct', wowInvert = false }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      border: '1px solid #F0F0EE', borderTop: `3px solid ${color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
        <span style={{ fontSize: '0.6875rem', color: '#A0A09E', fontWeight: 500 }}>{label}</span>
        {wow !== undefined && wow !== null && (
          <span style={{ marginLeft: 'auto' }}><WoWBadge wow={wow} kind={wowKind} invert={wowInvert} size="xs" /></span>
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.375rem', color: '#1A1A1A', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── 채널별 검색 성과 테이블 ─────────────────────────────────────────────────
function MediaTable({ mediaStats, sigma }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
      <thead>
        <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
          {['채널', '검색량', '검색 UV', '주문건수', '주문금액', '전환율(UV→주문)'].map((h, i) => (
            <th key={h} style={{
              padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right',
              fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap',
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {mediaStats.map(d => {
          const color = MEDIA_COLORS[d.media] || '#B4B2A9'
          const convPct = d.uv > 0 ? (d.orderCnt / d.uv * 100) : 0
          return (
            <tr key={d.media} style={{ borderBottom: '1px solid #F0F0EE' }}>
              <td style={{ padding: '9px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                  <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{d.media}</span>
                </div>
              </td>
              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>
                {fmtComma(d.searchVol)}
                <div style={{ height: 3, background: `${color}22`, borderRadius: 2, marginTop: 3 }}>
                  <div style={{ height: '100%', width: `${sigma.searchVol > 0 ? d.searchVol / sigma.searchVol * 100 : 0}%`, background: `${color}88`, borderRadius: 2 }} />
                </div>
              </td>
              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(d.uv)}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>{fmtComma(d.orderCnt)}건</td>
              <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color }}>{fmt억(d.orderAmt)}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                <span style={{
                  fontWeight: 700,
                  color: convPct >= 2 ? '#1A8060' : convPct >= 1 ? '#B45309' : '#6B6B68',
                  fontSize: '0.875rem',
                }}>
                  {convPct.toFixed(2)}%
                </span>
              </td>
            </tr>
          )
        })}
        <tr style={{ borderTop: '2px solid #E8E8E6', background: '#FAFAFA' }}>
          <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1A1A1A' }}>합계</td>
          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.searchVol)}</td>
          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.uv)}</td>
          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.orderCnt)}건</td>
          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#378ADD' }}>{fmt억(sigma.orderAmt)}</td>
          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#1A8060' }}>
            {sigma.uv > 0 ? (sigma.orderCnt / sigma.uv * 100).toFixed(2) : '0.00'}%
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ─── 매출 기여 키워드 테이블 ─────────────────────────────────────────────────
function TopKeywordTable({ keywords, title, colorKey = 'orderAmt' }) {
  const maxVal = Math.max(...keywords.map(k => k[colorKey] || 0), 1)
  return (
    <div>
      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6B6B68', marginBottom: 8 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
        <thead>
          <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#6B6B68', width: 28 }}>#</th>
            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#6B6B68' }}>검색어</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68' }}>검색량</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68' }}>주문건수</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68' }}>주문금액</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#6B6B68' }}>전환율</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw, i) => {
            const barW = kw[colorKey] > 0 ? kw[colorKey] / maxVal * 100 : 0
            return (
              <tr key={kw.keyword} style={{ borderBottom: '1px solid #F0F0EE' }}>
                <td style={{ padding: '8px 10px', color: '#A0A09E', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1A1A1A', maxWidth: 140 }}>
                  <div>{kw.keyword}</div>
                  {/* 바 */}
                  <div style={{ height: 3, background: '#F0F0EE', borderRadius: 2, marginTop: 3 }}>
                    <div style={{ height: '100%', width: `${barW}%`, background: '#378ADD55', borderRadius: 2 }} />
                  </div>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(kw.searchVol)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>{fmtComma(kw.orderCnt)}건</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#378ADD' }}>
                  {kw.orderAmt > 0 ? fmt억(kw.orderAmt) : <span style={{ color: '#C8C8C6' }}>-</span>}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700,
                    color: kw.convRate >= 2 ? '#1A8060' : '#A0A09E',
                  }}>
                    {kw.convRate.toFixed(2)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── 기회 키워드 (고검색-무구매) ─────────────────────────────────────────────
function OpportunityKeywords({ keywords }) {
  if (!keywords.length) return null
  return (
    <div style={{ background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontWeight: 700, color: '#B45309', fontSize: '0.8125rem', marginBottom: 10 }}>
        🔍 기회 키워드 — 검색 多, 주문 0
        <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: 8, color: '#92400E' }}>
          상품 노출·연관 상품 배치·검색 결과 UX 개선 필요
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {keywords.map(kw => (
          <div key={kw.keyword} style={{
            background: '#fff', border: '1px solid #FDE68A', borderRadius: 20,
            padding: '5px 14px', fontSize: '0.8125rem',
          }}>
            <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{kw.keyword}</span>
            <span style={{ color: '#B45309', marginLeft: 6, fontSize: '0.75rem' }}>검색 {fmtComma(kw.searchVol)}회</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 일별 검색 추이 ──────────────────────────────────────────────────────────
function DailySearchChart({ dailySearch }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={dailySearch} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EE" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#A0A09E' }} />
        <YAxis tick={{ fontSize: 10, fill: '#A0A09E' }} width={36} />
        <Tooltip
          formatter={(v, name) => [fmtComma(v), name === 'searchVol' ? '검색량' : name === 'uv' ? 'UV' : name]}
          labelStyle={{ fontSize: 12, fontWeight: 600 }}
        />
        <Bar dataKey="searchVol" name="searchVol" fill="#378ADD55" radius={[2, 2, 0, 0]} />
        <Bar dataKey="uv" name="uv" fill="#378ADD" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 메인 SearchSection ───────────────────────────────────────────────────────
export default function SearchSection({ searchMetrics }) {
  if (!searchMetrics) {
    return (
      <div className="card p-5" style={{ borderLeft: '3px solid #A0A09E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.25rem' }}>🔍</span>
          <div>
            <div style={{ fontWeight: 700, color: '#6B6B68', fontSize: '0.875rem' }}>검색 실적 파일 미업로드</div>
            <div style={{ fontSize: '0.8125rem', color: '#A0A09E', marginTop: 2 }}>
              검색 키워드별 구매 기여도·기회 키워드를 보려면 <strong>검색 실적</strong> 파일을 업로드하세요.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const {
    sigma, successRate, searchConvRate,
    topByOrderAmt, topBySearchVol, topByConvRate, highSearchZeroOrder,
    mediaStats, dailySearch, totalKeywords, period, wow,
  } = searchMetrics
  const w = wow || {}

  const kpis = [
    { label: '총 검색량',         value: fmtComma(sigma.searchVol),   icon: '🔍', color: '#378ADD',
      sub: `검색어 ${fmtComma(totalKeywords)}종`, wow: w.searchVol },
    { label: '검색 UV',           value: fmtComma(sigma.uv) + '명',    icon: '👤', color: '#7F77DD',
      sub: `검색 성공률 ${successRate.toFixed(1)}%`, wow: w.uv },
    { label: '검색 기반 주문건수', value: fmtComma(sigma.orderCnt) + '건', icon: '📋', color: '#5DCAA5',
      sub: `주문금액 ${fmt억(sigma.orderAmt)}`, wow: w.orderCnt },
    { label: '검색→구매 전환율',  value: searchConvRate.toFixed(2) + '%', icon: '🎯', color: '#EF9F27',
      sub: `UV 대비 주문 전환`, wow: w.convRate, wowKind: 'pp' },
  ]

  return (
    <div className="card p-5" style={{ borderTop: '3px solid #7F77DD' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ width: 3, height: 16, background: '#7F77DD', borderRadius: 2, display: 'inline-block' }} />
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A' }}>🔍 검색 실적 분석</span>
        <span style={{ fontSize: '0.75rem', color: '#A0A09E', marginLeft: 4 }}>검색어별 구매 기여도</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', background: '#F5F3FF', color: '#5B21B6', border: '1px solid #DDD6FE', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
          {period}
        </span>
      </div>

      {/* KPI 4개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(t => <KPITile key={t.label} {...t} />)}
      </div>

      {/* 채널별 검색 성과 */}
      <div style={{ marginBottom: 20 }}>
        <SectionHeader icon="📡" title="채널별 검색 성과" color="#7F77DD" />
        <MediaTable mediaStats={mediaStats} sigma={sigma} />
      </div>

      {/* 일별 검색량 추이 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6B6B68', marginBottom: 10 }}>
          일별 검색량 추이
          <span style={{ fontWeight: 400, color: '#A0A09E', marginLeft: 8, fontSize: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
              <span style={{ width: 10, height: 10, background: '#378ADD55', display: 'inline-block', borderRadius: 2 }} />검색량
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, background: '#378ADD', display: 'inline-block', borderRadius: 2 }} />UV
            </span>
          </span>
        </div>
        <DailySearchChart dailySearch={dailySearch} />
      </div>

      {/* 2열 레이아웃: 매출 기여 Top15 + 검색량 Top15 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <TopKeywordTable
          keywords={topByOrderAmt}
          title="💰 매출 기여 키워드 Top 15 (주문금액 기준)"
          colorKey="orderAmt"
        />
        <TopKeywordTable
          keywords={topBySearchVol}
          title="📈 검색량 상위 키워드 Top 15"
          colorKey="searchVol"
        />
      </div>

      {/* 기회 키워드 */}
      <OpportunityKeywords keywords={highSearchZeroOrder} />

      {/* 전환율 Top 10 */}
      {topByConvRate.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6B6B68', marginBottom: 8 }}>
            ⚡ 전환율 상위 키워드 Top 10
            <span style={{ fontWeight: 400, color: '#A0A09E', marginLeft: 6, fontSize: '0.75rem' }}>(검색량 5회 이상, 주문 有)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topByConvRate.map((kw, i) => (
              <div key={kw.keyword} style={{
                background: '#F0FDF8', border: '1px solid #5DCAA533', borderRadius: 20,
                padding: '5px 14px', fontSize: '0.8125rem',
              }}>
                <span style={{ color: '#A0A09E', marginRight: 4 }}>{i + 1}</span>
                <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{kw.keyword}</span>
                <span style={{ color: '#1A8060', marginLeft: 6, fontWeight: 700, fontSize: '0.75rem' }}>
                  {kw.convRate.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
