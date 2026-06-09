/**
 * SalesScoreboard — 기간별 매출분석 데이터 기반 스코어보드
 *
 * 제공 지표: 실주문금액, 주문자수, 주문건수, 실주문건수, 취소율, AOV, 혜택할인금액
 * 채널별 상세 테이블 (MOBILE / APP / PC)
 * 일별 실주문금액 추이 라인차트
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'

const MEDIA_COLORS = { APP: '#5DCAA5', MOBILE: '#378ADD', PC: '#B4B2A9' }
const MEDIA_ORDER  = ['MOBILE', 'APP', 'PC']

// ─── 핵심 KPI 타일 ───────────────────────────────────────────────────────────
function KPITile({ label, value, sub, color = '#378ADD', bg, icon, highlight }) {
  return (
    <div style={{
      background: bg || '#fff',
      border: `1px solid ${highlight ? color : '#F0F0EE'}`,
      borderTop: highlight ? `3px solid ${color}` : `1px solid #F0F0EE`,
      borderRadius: 12,
      padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {icon && <span style={{ fontSize: '0.875rem' }}>{icon}</span>}
        <span style={{ fontSize: '0.6875rem', color: '#A0A09E', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.5rem', color: highlight ? color : '#1A1A1A', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

// ─── 채널별 KPI 테이블 ───────────────────────────────────────────────────────
function ChannelTable({ channelStats, sigma }) {
  const totalAov = sigma.realOrderCnt > 0 ? Math.round(sigma.realAmt / sigma.realOrderCnt) : 0
  const orderedStats = MEDIA_ORDER
    .map(m => channelStats.find(c => c.media === m))
    .filter(Boolean)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: '#F8F8F7', borderBottom: '1px solid #E8E8E6' }}>
            {['채널', '주문자수', '주문건수', '실주문건수', '실주문금액', '취소율', '건당금액(AOV)', '할인율'].map((h, i) => (
              <th key={h} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#6B6B68', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedStats.map(d => {
            const color = MEDIA_COLORS[d.media] || '#B4B2A9'
            const isHighCancel = d.cancelRate > 8
            return (
              <tr key={d.media} style={{ borderBottom: '1px solid #F0F0EE' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
                    <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{d.media}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(d.buyerCnt)}명</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6B6B68' }}>{fmtComma(d.orderCnt)}건</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>{fmtComma(d.realOrderCnt)}건</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color }}>
                  {fmt억(d.realAmt)}
                  <div style={{ height: 3, background: `${color}33`, borderRadius: 2, marginTop: 3 }}>
                    <div style={{ height: '100%', width: `${sigma.realAmt > 0 ? d.realAmt / sigma.realAmt * 100 : 0}%`, background: color, borderRadius: 2 }} />
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <span style={{
                    fontWeight: 700, fontSize: '0.875rem',
                    color: isHighCancel ? '#DC2626' : '#1A8060',
                    background: isHighCancel ? '#FEF2F2' : '#F0FDF8',
                    borderRadius: 5, padding: '3px 8px',
                  }}>
                    {isHighCancel ? '⚠ ' : ''}{d.cancelRate.toFixed(1)}%
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>
                  {fmtComma(Math.round(d.aov))}원
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6B6B68' }}>
                  {d.discountRate.toFixed(1)}%
                </td>
              </tr>
            )
          })}
          {/* 합계 행 */}
          <tr style={{ borderTop: '2px solid #E8E8E6', background: '#FAFAFA' }}>
            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1A1A1A' }}>합계</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.buyerCnt)}명</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.orderCnt)}건</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(sigma.realOrderCnt)}건</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#378ADD' }}>{fmt억(sigma.realAmt)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
              <span style={{ color: '#1A1A1A' }}>
                {(100 - sigma.realOrderCnt / sigma.orderCnt * 100).toFixed(1)}%
              </span>
            </td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtComma(totalAov)}원</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
              {sigma.orderAmt > 0 ? (sigma.discountAmt / sigma.orderAmt * 100).toFixed(1) : 0}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── 일별 실주문금액 추이 ────────────────────────────────────────────────────
function DailyTrend({ dailyOrders, medias }) {
  const orderedMedias = MEDIA_ORDER.filter(m => medias.includes(m))

  return (
    <div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 10 }}>
        {orderedMedias.map(m => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 4, borderRadius: 2, background: MEDIA_COLORS[m] }} />
            <span style={{ fontSize: '0.8125rem', color: '#6B6B68' }}>{m}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={dailyOrders} margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EE" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6B68' }} />
          <YAxis tick={{ fontSize: 10, fill: '#6B6B68' }} tickFormatter={v => (v / 1e8).toFixed(1) + '억'} width={44} />
          <Tooltip
            formatter={(v, name) => [fmt억(v), name.replace('_amt', '')]}
            labelStyle={{ fontSize: 12, fontWeight: 600 }}
          />
          {orderedMedias.map(m => (
            <Line key={m} type="monotone" dataKey={m + '_amt'}
              stroke={MEDIA_COLORS[m]} strokeWidth={2.5}
              dot={{ r: 3, fill: MEDIA_COLORS[m] }} activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── 구매 퍼널 (UV 데이터 있을 때 완성) ────────────────────────────────────
function PurchaseFunnel({ metrics, visitMetrics, cartSigma }) {
  const { sigma } = metrics
  const totalUV    = visitMetrics?.channelKPIs?.reduce((s, k) => s + k.uv, 0) || 0
  const cartCnt    = cartSigma?.cartCnt || 0
  const orderCnt   = sigma.orderCnt || 0
  const realOrderCnt = sigma.realOrderCnt || 0

  const steps = [
    { label: 'UV 방문',       value: totalUV,      unit: '명', color: '#B4B2A9', available: totalUV > 0, icon: '🌐' },
    { label: '장바구니 담기', value: cartCnt,      unit: '건', color: '#7F77DD', available: cartCnt > 0, icon: '🛍' },
    { label: '주문 시도',     value: orderCnt,     unit: '건', color: '#EF9F27', available: orderCnt > 0, icon: '📝' },
    { label: '실주문 완료',   value: realOrderCnt, unit: '건', color: '#5DCAA5', available: realOrderCnt > 0, icon: '✅' },
    { label: '실주문금액',    value: null,         unit: '',   color: '#378ADD', available: true, icon: '💰', amt: sigma.realAmt },
  ]

  const funnelData = steps.filter(s => s.available || s.label === '장바구니 담기')

  const getConvRate = (prev, curr) => {
    if (!prev?.value || !curr?.value) return null
    return (curr.value / prev.value * 100).toFixed(1)
  }

  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 12 }}>
        📊 구매 전환 퍼널
        {totalUV === 0 && <span style={{ color: '#A0A09E', fontWeight: 400, marginLeft: 8 }}>— 방문실적 파일 업로드 시 UV 표시</span>}
        {cartCnt === 0 && <span style={{ color: '#A0A09E', fontWeight: 400, marginLeft: 8 }}>— 장바구니 담기수 확인 필요</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {steps.map((s, i) => {
          const prevStep = i > 0 ? steps[i - 1] : null
          const convRate = i > 0 ? getConvRate(prevStep, s) : null
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {/* 화살표 + 전환율 */}
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 6px', minWidth: 44 }}>
                  <div style={{ fontSize: '1.125rem', color: '#C8C8C6' }}>›</div>
                  {convRate && s.available && prevStep?.available && (
                    <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#EF9F27', background: '#FFF9F0', borderRadius: 3, padding: '1px 4px', textAlign: 'center' }}>
                      {convRate}%
                    </div>
                  )}
                </div>
              )}
              {/* 퍼널 박스 */}
              <div style={{
                background: s.available ? `${s.color}0F` : '#F8F8F7',
                border: `1px solid ${s.available ? s.color + '44' : '#E8E8E6'}`,
                borderRadius: 10, padding: '12px 14px', textAlign: 'center', minWidth: 104,
                opacity: s.available ? 1 : 0.5,
              }}>
                <div style={{ fontSize: '1.25rem', marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: '0.625rem', color: '#A0A09E', marginBottom: 3 }}>{s.label}</div>
                {s.amt !== undefined ? (
                  <div style={{ fontWeight: 800, fontSize: '1.125rem', color: s.color }}>{fmt억(s.amt)}</div>
                ) : s.available ? (
                  <div style={{ fontWeight: 700, fontSize: '1.125rem', color: s.color }}>
                    {fmtComma(s.value)}<span style={{ fontSize: '0.6875rem' }}>{s.unit}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#C8C8C6' }}>데이터 없음</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 메인 스코어보드 ─────────────────────────────────────────────────────────
export default function SalesScoreboard({ salesByDateMetrics, visitMetrics, cartSigma }) {
  if (!salesByDateMetrics) {
    return (
      <div className="card p-5" style={{ borderLeft: '3px solid #EF9F27' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.25rem' }}>📈</span>
          <div>
            <div style={{ fontWeight: 700, color: '#B45309', fontSize: '0.875rem' }}>기간별 매출분석 파일 미업로드</div>
            <div style={{ fontSize: '0.8125rem', color: '#A0A09E', marginTop: 2 }}>
              주문건수·주문자수·취소율·AOV·채널별 상세 KPI를 보려면 <strong>기간별 매출분석</strong> 파일을 업로드하세요.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { sigma, cancelRate, aov, discountRate, benefitRate, cancelAmt, channelStats, dailyOrders, medias } = salesByDateMetrics

  const kpiTiles = [
    { label: '실주문금액',  value: fmt억(sigma.realAmt),                    icon: '💰', color: '#378ADD', highlight: true },
    { label: '주문자수',    value: fmtComma(sigma.buyerCnt) + '명',          icon: '👤', color: '#5DCAA5' },
    { label: '주문건수',    value: fmtComma(sigma.orderCnt) + '건',          icon: '📋', color: '#7F77DD' },
    { label: '실주문건수',  value: fmtComma(sigma.realOrderCnt) + '건',      icon: '✅', color: '#5DCAA5' },
    {
      label: '취소/반품율',
      value: cancelRate.toFixed(1) + '%',
      icon: '↩', color: '#E24B4A',
      sub: `취소금액 ${fmt억(cancelAmt)}`,
      bg: cancelRate > 10 ? '#FEF2F2' : undefined,
    },
    {
      label: '건당 평균금액(AOV)',
      value: fmtComma(Math.round(aov)) + '원',
      icon: '🎯', color: '#EF9F27',
      sub: 'PC 최고 · MOBILE 최저',
    },
    { label: '혜택 할인금액', value: fmt억(sigma.discountAmt),               icon: '🏷',  color: '#B45309', sub: `할인율 ${discountRate.toFixed(1)}%` },
    { label: '혜택 적용율',   value: benefitRate.toFixed(1) + '%',           icon: '🎁', color: '#1A8060', sub: `총혜택 ${fmt억(sigma.totalBenefit)}` },
  ]

  return (
    <div className="card p-5" style={{ borderTop: '3px solid #378ADD' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ width: 3, height: 16, background: '#378ADD', borderRadius: 2, display: 'inline-block' }} />
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A' }}>📈 매출 스코어보드</span>
        <span style={{ fontSize: '0.75rem', color: '#A0A09E', marginLeft: 4 }}>기간별 매출분석 기준</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', background: '#EFF6FF', color: '#378ADD', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
          {salesByDateMetrics.period}
        </span>
      </div>

      {/* KPI 타일 8개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpiTiles.slice(0, 4).map(t => <KPITile key={t.label} {...t} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpiTiles.slice(4).map(t => <KPITile key={t.label} {...t} />)}
      </div>

      {/* 구매 퍼널 */}
      <div style={{ background: '#F8F8F7', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
        <PurchaseFunnel metrics={salesByDateMetrics} visitMetrics={visitMetrics} cartSigma={cartSigma} />
      </div>

      {/* 채널별 테이블 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6B6B68', marginBottom: 10 }}>
          채널별 상세 KPI
          <span style={{ fontWeight: 400, color: '#A0A09E', marginLeft: 8, fontSize: '0.75rem' }}>APP 취소율 주의 기준 8%</span>
        </div>
        <ChannelTable channelStats={channelStats} sigma={sigma} />
      </div>

      {/* 일별 추이 */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6B6B68', marginBottom: 10 }}>
          일별 실주문금액 추이 (채널별)
        </div>
        <DailyTrend dailyOrders={dailyOrders} medias={medias} />
      </div>

      {/* 데이터 갭 현황 */}
      <div style={{ marginTop: 18, borderRadius: 8, overflow: 'hidden', border: '1px solid #E8E8E6' }}>
        <div style={{ background: '#F8F8F7', padding: '8px 14px', fontSize: '0.75rem', fontWeight: 700, color: '#6B6B68', borderBottom: '1px solid #E8E8E6' }}>
          📋 퍼널 데이터 현황
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {[
            { icon: '✅', status: 'done',    text: '검색 키워드 구매 기여도',       sub: '검색 실적 파일 업로드 시 L1 하단에 표시' },
            { icon: '✅', status: 'done',    text: '신규 vs 재구매 고객 비율',       sub: '고객 분석 파일의 회원구분 컬럼으로 계산' },
            { icon: '⚠', status: 'pending', text: '장바구니 담기수 (일별×채널)',    sub: 'BO 장바구니 일별 리포트 별도 추출 필요' },
            { icon: '⚠', status: 'pending', text: '결제 단계별 이탈',               sub: '장바구니→주문서→결제완료 이탈 데이터 필요' },
            { icon: '⚠', status: 'pending', text: '쿠폰/프로모션별 전환 효과',      sub: 'BO 쿠폰 발급/사용 리포트 필요' },
            { icon: '⚠', status: 'pending', text: '재고 소진율 × 판매 상관관계',    sub: 'ERP 재고 데이터 연동 필요' },
          ].map(({ icon, status, text, sub }, i) => (
            <div key={text} style={{
              display: 'flex', gap: 8, padding: '10px 14px',
              borderBottom: i < 4 ? '1px solid #F0F0EE' : 'none',
              borderRight: i % 2 === 0 ? '1px solid #F0F0EE' : 'none',
              background: status === 'done' ? '#F0FDF8' : '#fff',
            }}>
              <span style={{ fontSize: '0.875rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: status === 'done' ? '#1A8060' : '#1A1A1A' }}>{text}</div>
                <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
