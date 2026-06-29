import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import KPICard from './common/KPICard'
import WoWBadge from './common/WoWBadge'
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'
import SalesScoreboard from './SalesScoreboard'
import SearchSection from './SearchSection'
import CouponSection from './CouponSection'

// ─── 색상 헬퍼 ───────────────────────────────────────────────────────────────
const CHANNEL_COLORS = ['#378ADD', '#5DCAA5', '#7F77DD', '#EF9F27', '#E24B4A', '#B4B2A9']
const MEDIA_COLORS   = { APP: '#5DCAA5', MOBILE: '#378ADD', PC: '#B4B2A9' }
const BOUNCE_THRESHOLD = 38

// 성별 컬러: "여자"/"여성"/"F" → 보라, "남자"/"남성"/"M" → 파랑, 기타 → 회색
function getGenderColor(name) {
  const n = String(name || '').toLowerCase()
  if ((n.includes('여') && !n.includes('미상')) || n === 'f' || n === 'female') return '#7F77DD'
  if ((n.includes('남') && !n.includes('미상')) || n === 'm' || n === 'male')   return '#378ADD'
  if (n.includes('공용')) return '#5DCAA5'
  if (n.includes('키즈') || n.includes('아동')) return '#EF9F27'
  return '#B4B2A9'
}

// ─── 섹션 헤더 ───────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge, color = '#378ADD' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ width: 3, height: 16, background: color, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
      {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
      <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1A1A1A' }}>{title}</span>
      {badge && (
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 10px' }}>
          {badge}
        </span>
      )}
    </div>
  )
}

// ─── 관점 배지 ───────────────────────────────────────────────────────────────
function PerspectiveBadge({ label }) {
  const config = {
    '사용자': { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    'MD':     { bg: '#FFF9F0', color: '#B45309', border: '#FDE68A' },
    '운영':   { bg: '#F0FDF8', color: '#1A8060', border: '#BBF7D0' },
  }[label] || { bg: '#F8F8F7', color: '#6B6B68', border: '#E8E8E6' }
  return (
    <span style={{
      fontSize: '0.625rem', fontWeight: 700,
      background: config.bg, color: config.color,
      border: `1px solid ${config.border}`,
      borderRadius: 4, padding: '2px 7px',
    }}>
      {label} 관점
    </span>
  )
}

// ─── KPI 5열 ─────────────────────────────────────────────────────────────────
function KPIRow({ kpis }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
      {kpis.map(kpi => <KPICard key={kpi.id} kpi={kpi} />)}
    </div>
  )
}

// ─── 채널별 실주문금액 도넛 ──────────────────────────────────────────────────
function ChannelDonut({ channelData }) {
  const total = channelData.reduce((s, d) => s + d.value, 0)
  const RADIAN = Math.PI / 180
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, value }) => {
    const r = innerRadius + (outerRadius - innerRadius) * 0.55
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    const pct = total > 0 ? (value / total * 100).toFixed(0) : 0
    if (Number(pct) < 5) return null
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{pct}%</text>
  }

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <SectionHeader icon="📱" title="채널별 실주문금액" color="#378ADD" />
        <PerspectiveBadge label="사용자" />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={channelData} cx="50%" cy="50%" outerRadius={85} innerRadius={44}
            dataKey="value" labelLine={false} label={renderLabel}>
            {channelData.map((d, i) => (
              <Cell key={d.name} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
          <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '0.8125rem' }} />
        </PieChart>
      </ResponsiveContainer>
      {/* 채널별 상세 바 */}
      {channelData.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {channelData.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLORS[i % CHANNEL_COLORS.length], flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: '#6B6B68', width: 60 }}>{d.name}</span>
              <div style={{ flex: 1, height: 6, background: '#F0F0EE', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${total > 0 ? d.value / total * 100 : 0}%`, background: CHANNEL_COLORS[i % CHANNEL_COLORS.length], borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A1A', width: 48, textAlign: 'right' }}>{fmt억(d.value)}</span>
              <span style={{ width: 56, textAlign: 'right', flexShrink: 0 }}><WoWBadge wow={d.wow} size="xs" /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 장바구니 퍼널 ───────────────────────────────────────────────────────────
function CartFunnel({ cartDerived }) {
  const { cartCnt = 0, orderCnt = 0, realAmt = 0, cartConvRate = 0, memberPct = 0, nonMemberPct = 0 } = cartDerived || {}
  const convLow = cartConvRate > 0 && cartConvRate < 5

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <SectionHeader icon="🛒" title="장바구니 퍼널" color="#5DCAA5" />
        <PerspectiveBadge label="운영" />
      </div>

      {/* 퍼널 단계 */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 14 }}>
        {[
          { label: '장바구니 담기', value: fmtComma(cartCnt), unit: '건', color: '#7F77DD', icon: '🛍' },
          null,
          { label: '주문 완료',    value: fmtComma(orderCnt), unit: '건', color: '#5DCAA5', icon: '✅' },
          null,
          { label: '실주문금액',   value: fmt억(realAmt),    unit: '',   color: '#378ADD', icon: '💰' },
        ].map((s, idx) => s === null
          ? <div key={idx} style={{ display: 'flex', alignItems: 'center', color: '#C8C8C6', fontSize: '1.25rem', padding: '0 4px' }}>›</div>
          : (
            <div key={s.label} style={{ flex: 1, background: `${s.color}0F`, borderRadius: 10, padding: '12px', textAlign: 'center', border: `1px solid ${s.color}33` }}>
              <div style={{ fontSize: '1.25rem', marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontWeight: 700, fontSize: '1.125rem', color: s.color }}>{s.value}<span style={{ fontSize: '0.75rem', marginLeft: 2 }}>{s.unit}</span></div>
            </div>
          )
        )}
      </div>

      {/* 전환율 + 회원 비율 */}
      <div style={{ display: 'flex', gap: 14, paddingTop: 12, borderTop: '1px solid #F0F0EE' }}>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 2 }}>장바구니 전환율</div>
          <div style={{ fontWeight: 700, fontSize: '1.375rem', color: convLow ? '#DC2626' : '#1A8060', display: 'flex', alignItems: 'center', gap: 4 }}>
            {convLow && <span style={{ fontSize: '0.875rem' }}>⚠</span>}
            {cartConvRate.toFixed(1)}%
          </div>
          {convLow && <div style={{ fontSize: '0.625rem', color: '#DC2626', marginTop: 2 }}>결제 UX 점검 필요</div>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 6 }}>회원 vs 비회원 (실주문금액 기준)</div>
          <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', gap: 1 }}>
            <div style={{ flex: memberPct, background: '#378ADD', transition: 'flex 0.5s' }} />
            <div style={{ flex: nonMemberPct, background: '#E24B4A', transition: 'flex 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: '0.6875rem', color: '#378ADD', fontWeight: 600 }}>🔵 회원 {memberPct.toFixed(0)}%</span>
            <span style={{ fontSize: '0.6875rem', color: '#E24B4A', fontWeight: 600 }}>🔴 비회원 {nonMemberPct.toFixed(0)}%</span>
          </div>
          {nonMemberPct > 40 && (
            <div style={{ fontSize: '0.625rem', color: '#B45309', marginTop: 3, background: '#FFF9F0', borderRadius: 4, padding: '3px 7px' }}>
              ⚠ 비회원 비중 {nonMemberPct.toFixed(0)}% — 회원 전환 프로모션 검토
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 고객 세그먼트 ───────────────────────────────────────────────────────────
// ─── 신규 vs 재구매 ──────────────────────────────────────────────────────────
function NewVsReturn({ newVsReturn }) {
  if (!newVsReturn?.available) {
    return (
      <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '10px 14px', fontSize: '0.75rem', color: '#A0A09E' }}>
        신규/재구매 데이터 없음 — 고객 분석 파일의 <strong>회원구분</strong> 컬럼 확인 필요
      </div>
    )
  }
  const { newCustCnt, returnCustCnt, newAmt, returnAmt, newPct, returnPct, newAmtPct, returnAmtPct, raw } = newVsReturn
  const totalCust = newCustCnt + returnCustCnt
  // 첫구매회원 방식(방법B)은 고객수만 제공하고 금액 분할이 없어 금액 비율이 0이 된다 → 금액 칸은 숨긴다.
  const hasAmtSplit = (newAmt + returnAmt) > 0

  return (
    <div>
      {/* 파이 + 바 형태 */}
      <div style={{ display: 'grid', gridTemplateColumns: hasAmtSplit ? '1fr 1fr' : '1fr', gap: 12 }}>
        {/* 구매 고객수 */}
        <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 8 }}>구매 고객수 비율</div>
          {[
            { label: '신규', cnt: newCustCnt, pct: newPct, color: '#5DCAA5' },
            { label: '재구매', cnt: returnCustCnt, pct: returnPct, color: '#378ADD' },
          ].map(d => (
            <div key={d.label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.75rem', color: '#6B6B68', fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: d.color }}>
                  {d.pct.toFixed(1)}% <span style={{ color: '#A0A09E', fontWeight: 400 }}>({d.cnt.toLocaleString()}명)</span>
                </span>
              </div>
              <div style={{ height: 6, background: '#E8E8E6', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${d.pct}%`, background: d.color, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
        {/* 실주문금액 — 금액 분할이 있는 경우(회원구분 방식)만 표시 */}
        {hasAmtSplit && (
        <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 8 }}>실주문금액 비율</div>
          {[
            { label: '신규', amt: newAmt, pct: newAmtPct, color: '#5DCAA5' },
            { label: '재구매', amt: returnAmt, pct: returnAmtPct, color: '#378ADD' },
          ].map(d => (
            <div key={d.label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.75rem', color: '#6B6B68', fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: d.color }}>
                  {d.pct.toFixed(1)}% <span style={{ color: '#A0A09E', fontWeight: 400 }}>({fmt억(d.amt)})</span>
                </span>
              </div>
              <div style={{ height: 6, background: '#E8E8E6', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${d.pct}%`, background: d.color, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
      {!hasAmtSplit && (
        <div style={{ marginTop: 6, fontSize: '0.6875rem', color: '#A0A09E' }}>
          ※ 고객 분석 파일이 <strong>첫구매회원(고객수)</strong>만 제공해 신규/재구매 <strong>금액</strong> 분할은 표시하지 않습니다.
        </div>
      )}
      {/* 원시 레이블 전체 (회원구분 컬럼 그대로) */}
      {raw.length > 2 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {raw.map(r => (
            <div key={r.name} style={{
              background: '#fff', border: '1px solid #E8E8E6', borderRadius: 6, padding: '4px 10px',
              fontSize: '0.6875rem', color: '#6B6B68',
            }}>
              {r.name} <strong style={{ color: '#1A1A1A' }}>{r.custPct.toFixed(1)}%</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CustomerSegment({ genderData, femaleAge, maleAge, newVsReturn }) {
  const totalAmt = genderData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <SectionHeader icon="👥" title="고객 세그먼트" color="#7F77DD" />
        <PerspectiveBadge label="사용자" />
      </div>

      <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginBottom: 12, lineHeight: 1.5 }}>
        ※ 성별·연령 금액은 <strong>고객 분석 파일</strong> 기준(집계 범위가 달라 매출 합계와 일치하지 않을 수 있음)이며, 절대액보다 <strong>구성 비율</strong>로 보세요.
      </div>

      {/* 신규 vs 재구매 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginBottom: 8, fontWeight: 600 }}>🔄 신규 vs 재구매 고객</div>
        <NewVsReturn newVsReturn={newVsReturn} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 20 }}>
        {/* 성별 파이 + 수평 비율 바 */}
        <div>
          <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginBottom: 8 }}>성별 구매 비율</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={genderData} cx="50%" cy="50%" outerRadius={65} innerRadius={32} dataKey="value">
                {genderData.map(d => (
                  <Cell key={d.name} fill={getGenderColor(d.name)} />
                ))}
              </Pie>
              <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
            </PieChart>
          </ResponsiveContainer>
          {/* 범례 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
            {genderData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: getGenderColor(d.name), flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: '#6B6B68', flex: 1 }}>{d.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A1A' }}>{d.pct.toFixed(0)}%</span>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>{fmt억(d.value)}</span>
                <WoWBadge wow={d.wow} size="xs" />
              </div>
            ))}
          </div>
        </div>

        {/* 여성 연령대 */}
        <div>
          <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#7F77DD', marginRight: 5, verticalAlign: 'middle' }} />
            여성 연령대별 실주문금액
          </div>
          {femaleAge.length === 0 ? (
            <div style={{ color: '#C8C8C6', fontSize: '0.8125rem', paddingTop: 20 }}>데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={femaleAge} layout="vertical" margin={{ left: 4, right: 60, top: 2, bottom: 2 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="age" width={50} tick={{ fontSize: 11, fill: '#6B6B68' }} />
                <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
                <Bar dataKey="realAmt" fill="#7F77DD" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="realAmt" position="right" formatter={v => fmt억(v)} style={{ fontSize: 10, fill: '#6B6B68' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 남성 연령대 */}
        <div>
          <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#378ADD', marginRight: 5, verticalAlign: 'middle' }} />
            남성 연령대별 실주문금액
          </div>
          {maleAge.length === 0 ? (
            <div style={{ color: '#C8C8C6', fontSize: '0.8125rem', paddingTop: 20 }}>데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={maleAge} layout="vertical" margin={{ left: 4, right: 60, top: 2, bottom: 2 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="age" width={50} tick={{ fontSize: 11, fill: '#6B6B68' }} />
                <Tooltip formatter={v => [fmt억(v), '실주문금액']} />
                <Bar dataKey="realAmt" fill="#378ADD" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="realAmt" position="right" formatter={v => fmt억(v)} style={{ fontSize: 10, fill: '#6B6B68' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 방문실적 섹션 ───────────────────────────────────────────────────────────
function VisitSection({ visitMetrics }) {
  const { channelKPIs = [], dailyUV = [] } = visitMetrics || {}
  const medias = Object.keys(MEDIA_COLORS)

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <SectionHeader icon="📡" title="유입 실적 (방문실적)" color="#378ADD" />
        <PerspectiveBadge label="운영" />
      </div>

      {/* 채널별 KPI 카드 3열 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {channelKPIs.map(kpi => {
          const isHighBounce = kpi.avgBounceRate > BOUNCE_THRESHOLD
          const color = MEDIA_COLORS[kpi.media] || '#B4B2A9'
          return (
            <div key={kpi.media} style={{ background: '#F8F8F7', borderRadius: 10, padding: '14px', border: `1px solid ${color}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{kpi.media}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { l: 'UV',      v: fmtComma(kpi.uv) + '명', wow: kpi.uvWoW },
                  { l: '세션',    v: fmtComma(kpi.session) + '건' },
                  { l: 'PV',      v: fmtComma(kpi.pv) },
                  { l: '세션당PV', v: kpi.sessionPV.toFixed(1) },
                ].map(({ l, v, wow }) => (
                  <div key={l}>
                    <div style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>{l}</div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {v}{wow !== undefined && <WoWBadge wow={wow} size="xs" />}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid #E8E8E6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>이탈률</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: isHighBounce ? '#DC2626' : '#1A8060' }}>
                    {isHighBounce ? '⚠ ' : '✓ '}{fmtPct(kpi.avgBounceRate)}
                  </span>
                  <WoWBadge wow={kpi.bounceWoW} kind="pp" invert size="xs" />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 이탈률 38% 기준 경고 */}
      {channelKPIs.some(k => k.avgBounceRate > BOUNCE_THRESHOLD) && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px', fontSize: '0.8125rem', color: '#DC2626', marginBottom: 12 }}>
          ⚠ 이탈률 38% 초과 채널 감지 — 랜딩 페이지 및 첫 화면 상품 배치 점검이 필요합니다.
        </div>
      )}

      {/* 일별 UV 추이 */}
      {dailyUV.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {medias.map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 14, height: 4, borderRadius: 2, background: MEDIA_COLORS[m] }} />
                <span style={{ fontSize: '0.8125rem', color: '#6B6B68' }}>{m}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyUV} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EE" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B6B68' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B6B68' }} tickFormatter={v => fmtComma(v)} width={54} />
              <Tooltip formatter={(v, name) => [fmtComma(v) + '명', name]} />
              <ReferenceLine y={0} stroke="#F0F0EE" />
              {medias.map(m => (
                <Line key={m} type="monotone" dataKey={m} stroke={MEDIA_COLORS[m]}
                  strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

// ─── 사이트 내 구매 발생 영역 (개선) ─────────────────────────────────────────
function StoreSection({ storeMetrics }) {
  const { storeGroupRevenue = [], pageCVR = [], exploreArea = { uv: 0, realAmt: 0 }, purchaseArea = { uv: 0, realAmt: 0 } } = storeMetrics || {}
  const totalUV  = (exploreArea.uv || 0) + (purchaseArea.uv || 0) || 1
  const topCVR   = pageCVR[0]?.cvr || 1

  return (
    <div className="card p-5">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <SectionHeader icon="🏪" title="사이트 내 구매 발생 영역" color="#5DCAA5" />
        <PerspectiveBadge label="운영" />
      </div>

      {/* ① 탐색 → 구매 전환 여정 (Journey flow) */}
      <div style={{ background: '#F8F8F7', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
        <div style={{ fontSize: '0.75rem', color: '#A0A09E', fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
          고객 구매 여정 — 탐색 영역에서 구매 영역으로
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* 탐색 영역 */}
          <div style={{ flex: 1, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#DC2626', marginBottom: 2 }}>🏠 탐색 영역</div>
            <div style={{ fontSize: '0.625rem', color: '#9CA3AF', marginBottom: 10 }}>홈 · 공통</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#A0A09E' }}>UV 합계</div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1A1A1A' }}>{fmtComma(exploreArea.uv)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#A0A09E' }}>실주문금액</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: '#DC2626' }}>{fmt억(exploreArea.realAmt)}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, height: 6, background: '#FECACA', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${(exploreArea.uv || 0) / totalUV * 100}%`, background: '#DC2626', borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 3 }}>전체 UV 중 {((exploreArea.uv || 0) / totalUV * 100).toFixed(0)}%</div>
          </div>

          {/* 화살표 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px', gap: 4 }}>
            <div style={{ fontSize: '1.5rem', color: '#EF9F27' }}>→</div>
            <div style={{ fontSize: '0.5625rem', color: '#EF9F27', fontWeight: 700, textAlign: 'center', lineHeight: 1.4 }}>고객<br/>이동</div>
          </div>

          {/* 구매 전환 영역 */}
          <div style={{ flex: 1, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#16A34A', marginBottom: 2 }}>🛒 구매 전환 영역</div>
            <div style={{ fontSize: '0.625rem', color: '#9CA3AF', marginBottom: 10 }}>검색 · 카테고리 · 기획전 · 유닛</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#A0A09E' }}>UV 합계</div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1A1A1A' }}>{fmtComma(purchaseArea.uv)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#A0A09E' }}>실주문금액</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: '#16A34A' }}>{fmt억(purchaseArea.realAmt)}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, height: 6, background: '#BBF7D0', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${(purchaseArea.uv || 0) / totalUV * 100}%`, background: '#16A34A', borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginTop: 3 }}>전체 UV 중 {((purchaseArea.uv || 0) / totalUV * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* ② 매장그룹별 기여 + 전환율 Top5 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 매장그룹 기여도 */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 8 }}>
            📊 매장그룹별 실주문금액 기여
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {storeGroupRevenue.slice(0, 6).map((d, i) => {
              const max = storeGroupRevenue[0]?.realAmt || 1
              const ratio = d.realAmt / max
              const colors = ['#378ADD', '#5DCAA5', '#7F77DD', '#EF9F27', '#E24B4A', '#B4B2A9']
              return (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem', color: '#6B6B68', minWidth: 90, flexShrink: 0 }}>{d.name}</span>
                  <div style={{ flex: 1, height: 8, background: '#F0F0EE', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${ratio * 100}%`, background: colors[i], borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A1A1A', minWidth: 44, textAlign: 'right' }}>{fmt억(d.realAmt)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 전환율 TOP 5 */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 8 }}>
            🎯 UV→구매 전환율 TOP 5 (UV≥500)
          </div>
          {pageCVR.length === 0 ? (
            <div style={{ color: '#C8C8C6', fontSize: '0.8125rem' }}>UV 500 이상 페이지 없음</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageCVR.slice(0, 5).map((r, i) => {
                const ratio = topCVR > 0 ? r.cvr / topCVR : 0
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{medals[i]}</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.75rem', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: '0.625rem', color: '#A0A09E' }}>UV {fmtComma(r.uv)} · 주문 {fmtComma(r.realCnt)}건</div>
                      <div style={{ height: 4, borderRadius: 2, background: '#F0F0EE', marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${ratio * 100}%`, background: '#5DCAA5', borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1A8060', flexShrink: 0 }}>{fmtPct(r.cvr)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 헬스체크 상단 요약 (개편) ───────────────────────────────────────────────
function QuickSummary({ derived, salesByDateMetrics }) {
  const { kpis, cartDerived, catData, ipData, visitMetrics, storeMetrics, newVsCarry, channelData, newVsReturn } = derived

  const totalRev   = kpis?.[0]?.rawValue || 0
  const ipTotal    = ipData?.reduce((s, d) => s + d.realAmt, 0) || 0
  const ipPct      = totalRev > 0 ? (ipTotal / totalRev * 100).toFixed(0) : 0
  const topIP      = ipData?.[0]
  const newPct     = newVsCarry?.[0]?.pct?.toFixed(0) || 0
  // 매출 성과 지표는 '기간별 매출분석' 파일이 원천이다(취소율/AOV/할인율/혜택금액 보유).
  // 해당 파일이 없을 때만 cartDerived 로 폴백.
  const cancelRate = salesByDateMetrics?.cancelRate ?? cartDerived?.cancelRate ?? 0
  const aov        = salesByDateMetrics?.aov ?? cartDerived?.aov ?? 0
  const discRate   = salesByDateMetrics?.discountRate ?? cartDerived?.discountRate ?? 0
  const benefitAmt = salesByDateMetrics?.sigma?.totalBenefit ?? cartDerived?.benefitAmt ?? 0
  const cartConv   = cartDerived?.cartConvRate || 0
  const nonMemPct  = cartDerived?.nonMemberPct || 0
  const newCustPct = newVsReturn?.newPct || 0
  const retCustPct = newVsReturn?.returnPct || 0
  const femalePct  = derived.genderData?.find(g => g.name === '여성')?.pct || 0
  const malePct    = derived.genderData?.find(g => g.name === '남성')?.pct || 0
  const kidsPct    = derived.genderData?.find(g => g.name === '키즈')?.pct || 0

  // 이상 감지 뱃지
  const wow = kpis?.[0]?.wow
  const alerts = []
  if (wow != null && wow <= -10) alerts.push({ icon: '🔴', text: `매출 급락 ${wow > 0 ? '+' : ''}${wow.toFixed(0)}%` })
  else if (wow != null && wow >= 20) alerts.push({ icon: '🟢', text: `매출 급등 +${wow.toFixed(0)}%` })
  if (cartConv > 0 && cartConv < 5) alerts.push({ icon: '🟡', text: `전환율 저조 ${cartConv.toFixed(1)}%` })

  const kv = (key, val, warn = false) => (
    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: '0.6875rem', color: '#A0A09E', flexShrink: 0 }}>{key}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: warn ? '#DC2626' : '#1A1A1A', background: warn ? '#FEF2F2' : 'transparent', borderRadius: 4, padding: warn ? '1px 5px' : 0 }}>
        {warn ? '⚠ ' : ''}{val}
      </span>
    </div>
  )

  const cardStyle = (bg, border) => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px',
    display: 'flex', flexDirection: 'column', gap: 8,
  })

  const cardTitle = (icon, title, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: '0.875rem', color }}>{title}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 이상 감지 뱃지 */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => (
            <span key={i} style={{ fontSize: '0.75rem', fontWeight: 600, background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 20, padding: '3px 10px' }}>
              {a.icon} {a.text}
            </span>
          ))}
        </div>
      )}

      {/* 3열 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* 💰 매출 성과 */}
        <div style={cardStyle('#FFF9F0', '#FDE68A')}>
          {cardTitle('💰', '매출 성과', '#B45309')}
          {kv('취소율', `${cancelRate.toFixed(1)}%`, cancelRate > 15)}
          {kv('객단가 (AOV)', `${fmtComma(Math.round(aov / 1000))}천원`)}
          {kv('할인율', `${discRate.toFixed(1)}%`)}
          {kv('혜택금액', fmt억(benefitAmt))}
          {kv('신상 비중', `${newPct}%`)}
          {kv('IP 콜라보', ipTotal > 0 ? `${ipPct}% (${topIP?.name || ''})` : '없음')}
        </div>

        {/* 📡 채널 현황 */}
        <div style={cardStyle('#EFF6FF', '#BFDBFE')}>
          {cardTitle('📡', '채널 현황', '#1D4ED8')}
          {channelData?.slice(0, 3).map(ch => kv(ch.name, fmt억(ch.realAmt)))}
          {kv('장바구니 전환율', `${cartConv.toFixed(1)}%`, cartConv > 0 && cartConv < 5)}
          {visitMetrics?.channelKPIs?.length > 0
            ? kv('평균 이탈률', `${(visitMetrics.channelKPIs.reduce((s, k) => s + k.avgBounceRate, 0) / visitMetrics.channelKPIs.length).toFixed(1)}%`)
            : kv('방문 데이터', '미업로드')}
        </div>

        {/* 👥 고객 행동 */}
        <div style={cardStyle('#F0FDF8', '#BBF7D0')}>
          {cardTitle('👥', '고객 행동', '#1A8060')}
          {kv('신규 고객', newCustPct > 0 ? `${newCustPct.toFixed(0)}%` : '—')}
          {kv('재구매 고객', retCustPct > 0 ? `${retCustPct.toFixed(0)}%` : '—')}
          {kv('성별 (여/남/키즈)', `${femalePct.toFixed(0)}% / ${malePct.toFixed(0)}% / ${kidsPct.toFixed(0)}%`)}
          {kv('비회원 구매 비중', `${nonMemPct.toFixed(0)}%`, nonMemPct > 40)}
          {kv('PV 갭 주의 상품', `${derived.pvGapList?.filter(p => p.gap > 3).length || 0}개`)}
        </div>
      </div>
    </div>
  )
}

// ─── L1 메인 ─────────────────────────────────────────────────────────────────
export default function L1_HealthCheck({ derived, salesByDateMetrics, searchMetrics }) {
  const { kpis, channelData, cartDerived, genderData, femaleAge, maleAge,
    visitMetrics, storeMetrics, hasWoW, thisP, lastP, newVsReturn } = derived

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── 기간별 매출 스코어보드 ── */}
      <SalesScoreboard
        salesByDateMetrics={salesByDateMetrics}
        visitMetrics={visitMetrics}
        cartSigma={cartDerived}
      />

      {/* WoW 기간 안내 */}
      {hasWoW ? (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 16px', fontSize: '0.8125rem', color: '#1D4ED8' }}>
          📅 이번 주: <strong>{thisP}</strong> &nbsp;|&nbsp; 지난 주: <strong>{lastP}</strong> — 전주 대비(WoW) 자동 계산 중
        </div>
      ) : (
        <div style={{ background: '#F8F8F7', border: '1px solid #E8E8E6', borderRadius: 8, padding: '8px 16px', fontSize: '0.8125rem', color: '#A0A09E' }}>
          ℹ 1개 기간 데이터 — WoW 비활성 (2주치 업로드 시 활성화)
        </div>
      )}

      {/* ── KPI 5열 ── */}
      <KPIRow kpis={kpis} />

      {/* ── 관점별 빠른 요약 ── */}
      <QuickSummary derived={derived} salesByDateMetrics={salesByDateMetrics} />

      {/* ── 채널 도넛 + 장바구니 퍼널 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <ChannelDonut channelData={channelData} />
        <CartFunnel cartDerived={cartDerived} />
      </div>

      {/* ── 고객 세그먼트 ── */}
      <CustomerSegment genderData={genderData} femaleAge={femaleAge} maleAge={maleAge} newVsReturn={newVsReturn} />

      {/* ── 방문실적 (선택) ── */}
      {visitMetrics && <VisitSection visitMetrics={visitMetrics} />}

      {/* ── 매장 실적 (선택) ── */}
      {storeMetrics && <StoreSection storeMetrics={storeMetrics} />}

      {/* ── 검색 실적 ── */}
      <SearchSection searchMetrics={searchMetrics} />

      {/* ── 쿠폰 효율 (프로모션) ── */}
      <CouponSection couponMetrics={derived.couponMetrics} />
    </div>
  )
}
