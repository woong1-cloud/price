/**
 * CouponSection — 쿠폰(프로모션) 효율 전용 섹션
 *
 * 쿠폰 실적 파일(프로모션별 발급/사용/할인/실주문 + 부담주체) 기반.
 * 핵심: "얼마를 할인해서(누구 부담으로) 얼마를 팔았나" — MD/마케팅 손익·효율 관점.
 */
import { useState } from 'react'
import { fmt억, fmtComma } from '../utils/metrics'
import WoWBadge from './common/WoWBadge'

const BURDEN_COLORS = {
  MD: '#378ADD', 마케팅: '#7F77DD', 지점: '#5DCAA5', 업체: '#EF9F27',
  CS: '#E24B4A', 멤버스: '#1A8060', 기타: '#B4B2A9',
}

function KTile({ label, value, sub, color = '#378ADD', wow, wowKind, wowInvert, highlight }) {
  return (
    <div style={{
      background: highlight ? `${color}0F` : '#F8F8F7',
      border: `1px solid ${highlight ? color + '44' : '#F0F0EE'}`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '1.25rem', color }}>{value}</span>
        {wow !== null && wow !== undefined && <WoWBadge wow={wow} kind={wowKind} invert={wowInvert} size="xs" />}
      </div>
      {sub && <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function CouponSection({ couponMetrics }) {
  const [group, setGroup] = useState('all')
  if (!couponMetrics) return null
  const { summary, burdenList, byGroup, promos, wow, hasPrev, period } = couponMetrics

  const totalBurden = burdenList.reduce((s, b) => s + b.amt, 0) || 1
  const filteredPromos = (group === 'all' ? promos : promos.filter(p => p.promoGroup === group)).slice(0, 15)

  return (
    <div className="card p-5" style={{ borderTop: '3px solid #7F77DD' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 3, height: 16, background: '#7F77DD', borderRadius: 2, display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A' }}>🎟️ 쿠폰 효율 (프로모션)</span>
          {period && <span style={{ fontSize: '0.6875rem', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{period}</span>}
        </div>
        <span style={{ fontSize: '0.6875rem', background: '#F8F7FC', color: '#5B4FC4', border: '1px solid #E5E1F5', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
          할인 비용 · 부담주체 · 효율
        </span>
      </div>

      {/* KPI 타일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KTile label="쿠폰 발급수" value={fmtComma(summary.issued) + '장'} color="#6B6B68" />
        <KTile label="사용률" value={summary.usageRate.toFixed(2) + '%'} sub={`순사용 ${fmtComma(summary.used)}장`} color="#378ADD" wow={wow?.used} wowKind="pct" />
        <KTile label="쿠폰 기여 실주문" value={fmt억(summary.realAmt)} color="#1A8060" highlight wow={wow?.realAmt} />
        <KTile label="총 할인비용" value={fmt억(summary.discount)} color="#E24B4A" wow={wow?.discount} wowInvert />
        <KTile label="명목 효율" value={summary.efficiency.toFixed(1) + '배'} sub="실주문 ÷ 할인 (증분 아님)" color="#7F77DD" />
      </div>

      {/* 부담주체 분할 */}
      {burdenList.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 8 }}>
            할인 비용 부담 주체 <span style={{ fontWeight: 400, color: '#A0A09E' }}>· 총 {fmt억(totalBurden)}</span>
          </div>
          <div style={{ height: 14, display: 'flex', borderRadius: 7, overflow: 'hidden', gap: 1, marginBottom: 8 }}>
            {burdenList.map(b => (
              <div key={b.name} title={`${b.name} ${fmt억(b.amt)}`} style={{ flex: b.amt, background: BURDEN_COLORS[b.name] || '#B4B2A9' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {burdenList.map(b => (
              <span key={b.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.6875rem', color: '#6B6B68' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: BURDEN_COLORS[b.name] || '#B4B2A9' }} />
                {b.name} <strong style={{ color: '#1A1A1A' }}>{fmt억(b.amt)}</strong>
                <span style={{ color: '#A0A09E' }}>({(b.amt / totalBurden * 100).toFixed(0)}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 그룹 필터 (장바구니=온라인 / 오프라인주문 등) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {[{ group: 'all', realAmt: summary.realAmt }, ...byGroup].map(g => {
          const active = group === g.group
          const label = g.group === 'all' ? '전체' : g.group
          return (
            <button key={g.group} onClick={() => setGroup(g.group)} style={{
              cursor: 'pointer', font: 'inherit',
              background: active ? '#7F77DD' : '#fff',
              border: `1px solid ${active ? '#7F77DD' : '#E5E1F5'}`,
              color: active ? '#fff' : '#3A3A38',
              borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
            }}>
              {label} <span style={{ color: active ? '#E5E1F5' : '#A0A09E', fontWeight: 500 }}>{fmt억(g.realAmt)}</span>
            </button>
          )
        })}
      </div>

      {/* 프로모션 TOP 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
              {['#', '프로모션', '그룹', '발급', '순사용', '사용률', '기여 실주문', '할인비용', '효율'].map((h, i) => (
                <th key={h} style={{ padding: '9px 12px', textAlign: i === 1 ? 'left' : i <= 2 ? 'center' : 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPromos.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#A0A09E' }}>이 그룹에는 프로모션이 없습니다.</td></tr>
            )}
            {filteredPromos.map((p, i) => {
              const lowEff = p.discount > 1_000_000 && p.realAmt < p.discount * 2
              return (
                <tr key={p.promoName} style={{ borderBottom: '1px solid #F0F0EE', background: lowEff ? '#FFFBFB' : 'transparent' }}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#A0A09E', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', maxWidth: 240 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {lowEff && <span title="할인 대비 매출 저조" style={{ fontSize: '0.75rem' }}>⚠</span>}
                      <span style={{ fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.promoName}</span>
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#6B6B68', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>{p.promoGroup || '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#A0A09E' }}>{fmtComma(p.issued)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(p.used)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: p.usageRate >= 10 ? '#1A8060' : '#6B6B68' }}>{p.usageRate.toFixed(1)}%</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#1A8060' }}>{fmt억(p.realAmt)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#E24B4A' }}>{fmt억(p.discount)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: lowEff ? '#DC2626' : '#7F77DD' }}>
                    {p.efficiency > 0 ? p.efficiency.toFixed(1) + '배' : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 주의 안내 */}
      <div style={{ marginTop: 12, fontSize: '0.6875rem', color: '#A0A09E', lineHeight: 1.6, background: '#F8F8F7', borderRadius: 8, padding: '8px 12px' }}>
        ※ <strong>명목 효율</strong>은 쿠폰 없이도 샀을 고객을 포함하므로 증분 ROI가 아닙니다. ·
        <strong> 오프라인주문쿠폰</strong>은 자사몰 실주문이 잡히지 않아 기여 실주문이 0일 수 있습니다(그룹 필터로 분리 확인).
      </div>
    </div>
  )
}
