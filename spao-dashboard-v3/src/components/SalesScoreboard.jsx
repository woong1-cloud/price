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
import WoWBadge from './common/WoWBadge'

const MEDIA_COLORS = { APP: '#5DCAA5', MOBILE: '#378ADD', PC: '#B4B2A9' }
const MEDIA_ORDER  = ['MOBILE', 'APP', 'PC']

// ─── 핵심 KPI 타일 ───────────────────────────────────────────────────────────
function KPITile({ label, value, sub, color = '#378ADD', bg, icon, highlight, wow, wowKind, wowInvert }) {
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
      {(wow !== null && wow !== undefined) && (
        <div style={{ marginTop: 7 }}>
          <WoWBadge wow={wow} kind={wowKind} invert={wowInvert} suffix="vs 전주" />
        </div>
      )}
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

// ─── 유입 → 사이트 전환 (UV 데이터 있을 때 완성) ──────────────────────────
function PurchaseFunnel({ metrics, visitMetrics, cartSigma }) {
  const { sigma, prevSigma } = metrics
  const totalUV      = visitMetrics?.totalUV || visitMetrics?.channelKPIs?.reduce((s, k) => s + k.uv, 0) || 0
  const prevTotalUV  = visitMetrics?.prevTotalUV || 0
  const cartCnt      = cartSigma?.cartCnt || 0
  const prevCartCnt  = cartSigma?.prevCartCnt ?? null
  const orderCnt     = sigma.orderCnt || 0
  const realOrderCnt = sigma.realOrderCnt || 0
  const prevOrderCnt     = prevSigma?.orderCnt ?? null
  const prevRealOrderCnt = prevSigma?.realOrderCnt ?? null

  // ── 히어로 지표: 유입(UV) 변화 → 사이트 전환율(실주문÷UV) 변화 ──
  const uvWoW        = prevTotalUV > 0 ? ((totalUV - prevTotalUV) / prevTotalUV * 100) : null
  const siteConv     = totalUV > 0 ? (realOrderCnt / totalUV * 100) : null
  const prevSiteConv = (prevTotalUV > 0 && prevRealOrderCnt !== null)
    ? (prevRealOrderCnt / prevTotalUV * 100)
    : null
  const siteConvWoW  = (siteConv !== null && prevSiteConv !== null) ? (siteConv - prevSiteConv) : null

  const steps = [
    { label: 'UV 방문',       value: totalUV,      prev: prevTotalUV || null,    unit: '명', color: '#B4B2A9', available: totalUV > 0, icon: '🌐' },
    { label: '장바구니 담기', value: cartCnt,      prev: prevCartCnt,            unit: '건', color: '#7F77DD', available: cartCnt > 0, icon: '🛍' },
    { label: '주문 시도',     value: orderCnt,     prev: prevOrderCnt,           unit: '건', color: '#EF9F27', available: orderCnt > 0, icon: '📝' },
    { label: '실주문 완료',   value: realOrderCnt, prev: prevRealOrderCnt,       unit: '건', color: '#5DCAA5', available: realOrderCnt > 0, icon: '✅' },
    { label: '실주문금액',    value: null,         prev: null,                   unit: '',   color: '#378ADD', available: true, icon: '💰', amt: sigma.realAmt },
  ]

  const convPct = (prev, curr) => {
    if (!prev?.value || !curr?.value) return null
    return (curr.value / prev.value * 100)
  }
  // 단계 전환율의 전주 대비 %p 변화 (양쪽 모두 prev 값이 있어야 계산)
  const convWoW = (prev, curr) => {
    if (!prev?.value || !curr?.value || !prev?.prev || !curr?.prev) return null
    const now  = curr.value / prev.value * 100
    const then = curr.prev / prev.prev * 100
    return now - then
  }

  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 12 }}>
        📊 유입 → 사이트 전환
        {totalUV === 0 && <span style={{ color: '#A0A09E', fontWeight: 400, marginLeft: 8 }}>— 방문실적 파일 업로드 시 UV 표시</span>}
        {cartCnt === 0 && <span style={{ color: '#A0A09E', fontWeight: 400, marginLeft: 8 }}>— 장바구니 담기수 확인 필요</span>}
      </div>

      {/* ── 히어로: 유입(UV) 변화 → 사이트 전환율 변화 ── */}
      {siteConv !== null && (
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 14, flexWrap: 'wrap',
          background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF8 100%)',
          border: '1px solid #BFDBFE', borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        }}>
          {/* 유입(UV 방문) */}
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: '#6B6B68', fontWeight: 600, marginBottom: 4 }}>
              📈 유입 <span style={{ color: '#A0A09E', fontWeight: 400 }}>(UV 방문)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: '1.75rem', color: '#0F766E', lineHeight: 1 }}>
                {fmtComma(totalUV)}<span style={{ fontSize: '0.875rem', fontWeight: 600 }}>명</span>
              </span>
              {uvWoW !== null && <WoWBadge wow={uvWoW} suffix="vs 전주" />}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginTop: 5 }}>
              {prevTotalUV > 0 ? <>전주 {fmtComma(prevTotalUV)}명</> : '전주 데이터 없음'}
            </div>
          </div>

          {/* 화살표 */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#93C5FD', fontSize: '1.5rem', padding: '0 2px' }}>→</div>

          {/* 사이트 전환율 */}
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: '#6B6B68', fontWeight: 600, marginBottom: 4 }}>
              🎯 사이트 전환율 <span style={{ color: '#A0A09E', fontWeight: 400 }}>(UV → 실주문)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: '1.75rem', color: '#1D4ED8', lineHeight: 1 }}>
                {siteConv.toFixed(2)}%
              </span>
              {siteConvWoW !== null && <WoWBadge wow={siteConvWoW} kind="pp" suffix="vs 전주" />}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginTop: 5 }}>
              {fmtComma(realOrderCnt)}건 ÷ UV {fmtComma(totalUV)}명
              {prevSiteConv !== null && <span> · 전주 {prevSiteConv.toFixed(2)}%</span>}
            </div>
          </div>

          {/* 해석 코멘트 — 유입과 전환을 함께 설명 */}
          {(siteConvWoW !== null || uvWoW !== null) && (() => {
            const convDown = siteConvWoW !== null && siteConvWoW < 0
            const tone = convDown ? { c: '#B91C1C', bg: '#FEF2F2', b: '#FECACA' } : { c: '#15803D', bg: '#F0FDF4', b: '#BBF7D0' }
            const uvPhrase = uvWoW === null ? null
              : uvWoW >= 0 ? `유입은 전주 대비 ${uvWoW >= 0 ? '+' : ''}${uvWoW.toFixed(1)}% 늘었`
              : `유입이 전주 대비 ${uvWoW.toFixed(1)}% 줄었`
            return (
              <div style={{
                flex: '1 1 200px', minWidth: 180, fontSize: '0.75rem', lineHeight: 1.6,
                color: tone.c, background: tone.bg, border: `1px solid ${tone.b}`,
                borderRadius: 10, padding: '10px 14px',
                display: 'flex', alignItems: 'center',
              }}>
                <span>
                  {siteConvWoW !== null && (
                    convDown
                      ? <><strong>전환율이 {Math.abs(siteConvWoW).toFixed(2)}%p 빠졌습니다.</strong> </>
                      : <><strong>전환율이 {siteConvWoW.toFixed(2)}%p 올랐습니다.</strong> </>
                  )}
                  {uvPhrase && <>{uvPhrase}고, </>}
                  {convDown
                    ? '들어온 유입이 구매로 덜 이어졌어요 — 어느 단계에서 새는지 아래 퍼널에서 확인하세요.'
                    : '유입 대비 구매 효율이 개선됐어요.'}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── 단계별 퍼널 (전환율 + 전주 대비 %p) ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {steps.map((s, i) => {
          const prevStep = i > 0 ? steps[i - 1] : null
          const rate = i > 0 ? convPct(prevStep, s) : null
          const rateWoW = i > 0 ? convWoW(prevStep, s) : null
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              {/* 화살표 + 전환율 + WoW %p */}
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 6px', minWidth: 52, marginTop: 30 }}>
                  <div style={{ fontSize: '1.125rem', color: '#C8C8C6' }}>›</div>
                  {rate !== null && s.available && prevStep?.available && (
                    <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#EF9F27', background: '#FFF9F0', borderRadius: 3, padding: '1px 4px', textAlign: 'center' }}>
                      {rate.toFixed(1)}%
                    </div>
                  )}
                  {rateWoW !== null && s.available && prevStep?.available && (
                    <div style={{ marginTop: 3 }}>
                      <WoWBadge wow={rateWoW} kind="pp" size="xs" />
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

  const { sigma, cancelRate, aov, discountRate, benefitRate, cancelAmt, channelStats, dailyOrders, medias, wow } = salesByDateMetrics
  const w = wow || {}

  const kpiTiles = [
    { label: '실주문금액',  value: fmt억(sigma.realAmt),                    icon: '💰', color: '#378ADD', highlight: true, wow: w.realAmt },
    { label: '주문자수',    value: fmtComma(sigma.buyerCnt) + '명',          icon: '👤', color: '#5DCAA5', wow: w.buyerCnt },
    { label: '주문건수',    value: fmtComma(sigma.orderCnt) + '건',          icon: '📋', color: '#7F77DD', wow: w.orderCnt },
    { label: '실주문건수',  value: fmtComma(sigma.realOrderCnt) + '건',      icon: '✅', color: '#5DCAA5', wow: w.realOrderCnt },
    {
      label: '취소/반품율',
      value: cancelRate.toFixed(1) + '%',
      icon: '↩', color: '#E24B4A',
      sub: `취소금액 ${fmt억(cancelAmt)}`,
      bg: cancelRate > 10 ? '#FEF2F2' : undefined,
      wow: w.cancelRate, wowKind: 'pp', wowInvert: true,
    },
    {
      label: '건당 평균금액(AOV)',
      value: fmtComma(Math.round(aov)) + '원',
      icon: '🎯', color: '#EF9F27',
      sub: 'PC 최고 · MOBILE 최저',
      wow: w.aov,
    },
    { label: '혜택 할인금액', value: fmt억(sigma.discountAmt),               icon: '🏷',  color: '#B45309', sub: `할인율 ${discountRate.toFixed(1)}%`, wow: w.discountAmt, wowInvert: true },
    { label: '혜택 적용율',   value: benefitRate.toFixed(1) + '%',           icon: '🎁', color: '#1A8060', sub: `총혜택 ${fmt억(sigma.totalBenefit)}`, wow: w.benefitRate, wowKind: 'pp' },
  ]

  return (
    <div className="card p-5" style={{ borderTop: '3px solid #378ADD' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ width: 3, height: 16, background: '#378ADD', borderRadius: 2, display: 'inline-block' }} />
        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A' }}>📈 매출 스코어보드</span>
        <span style={{ fontSize: '0.75rem', color: '#A0A09E', marginLeft: 4 }}>기간별 매출분석 기준</span>
        {wow ? (
          <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', background: '#F0FDF8', color: '#1A8060', border: '1px solid #BBF7D0', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
            ● 전주 대비(WoW) 활성{wow.period ? ` · 전주 ${wow.period}` : ''}
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', background: '#F8F8F7', color: '#A0A09E', border: '1px solid #E8E8E6', borderRadius: 4, padding: '2px 8px', fontWeight: 500 }}>
            전주 데이터 업로드 시 WoW 표시
          </span>
        )}
        <span style={{ fontSize: '0.6875rem', background: '#EFF6FF', color: '#378ADD', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
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
