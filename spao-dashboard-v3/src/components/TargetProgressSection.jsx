/**
 * TargetProgressSection — 목표 대비 · 전년 동요일 비교 스코어보드
 *
 * L1_HealthCheck(종합진단) 상단, 매출 스코어보드 바로 아래에 렌더링된다.
 * 매출/전환율/객단가 3개 지표 각각에 대해:
 *   ① 이번 기간 실적값(props로 받음 — 기존 N.E.E.D 파이프라인 숫자 그대로)
 *   ② 목표 대비 달성률(daily_target 기간 합산/평균, storage.getTargetProgressData)
 *   ③ 전년 동요일(364일 전) 대비 증감(daily_last_year_actual)
 * 을 한 타일에 모아 보여준다.
 */
import { useEffect, useState } from 'react'
import { fmt억, fmtComma, fmtPct } from '../utils/metrics'
import { getTargetProgressData } from '../utils/storage'
import WoWBadge from './common/WoWBadge'

const ORANGE = '#E8710A'
const GREEN = '#5DCAA5'
const BLUE = '#378ADD'

function ProgressBar({ pct, color }) {
  const width = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ height: 7, background: '#F0F0EE', borderRadius: 4, margin: '6px 0 3px' }}>
      <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
    </div>
  )
}

// pct: 목표 대비 달성률(%, null이면 목표 데이터 없음). yoyValue: 전년 대비 증감(null이면 작년 데이터 없음).
function TargetTile({ label, valueText, pct, targetText, color, yoyValue, yoyKind }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: '#FAFAF9', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.625rem', color: '#6B6B68', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1A1A1A' }}>{valueText}</div>
      {pct !== null ? (
        <>
          <ProgressBar pct={pct} color={color} />
          <div style={{ fontSize: '0.65625rem', color: '#6B6B68', marginBottom: 6 }}>
            목표 {pct.toFixed(0)}% 달성 <span style={{ color: '#C8C8C6' }}>({targetText} 중)</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.65625rem', color: '#C8C8C6', margin: '9px 0 6px' }}>목표 데이터 없음</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: '0.5625rem', color: '#A0A09E' }}>전년 동요일</span>
        {yoyValue !== null
          ? <WoWBadge wow={yoyValue} kind={yoyKind} size="xs" />
          : <span style={{ fontSize: '0.65625rem', color: '#C8C8C6' }}>작년 데이터 없음</span>}
      </div>
    </div>
  )
}

export default function TargetProgressSection({ periodStart, periodEnd, revenue, convRate, aov }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    // getTargetProgressData는 periodStart/periodEnd가 없으면 null로 안전하게
    // resolve한다(storage.js 참고) — 이 컴포넌트는 L1_HealthCheck가 두 값이
    // 모두 있을 때만 렌더링하므로 실질적으로는 항상 채워져 있다.
    let cancelled = false
    getTargetProgressData(periodStart, periodEnd).then(res => { if (!cancelled) setData(res) })
    return () => { cancelled = true }
  }, [periodStart, periodEnd])

  if (!data) return null

  const { revenueTarget, convRateTarget, aovTarget, hasTarget, lastYear, hasLastYear } = data

  const revenuePct = hasTarget && revenueTarget > 0 ? revenue / revenueTarget * 100 : null
  const convRatePct = hasTarget && convRateTarget > 0 ? convRate / convRateTarget * 100 : null
  const aovPct = hasTarget && aovTarget > 0 ? aov / aovTarget * 100 : null

  const revenueYoy = hasLastYear && lastYear.revenue > 0 ? (revenue - lastYear.revenue) / lastYear.revenue * 100 : null
  const convRateYoy = hasLastYear && lastYear.convRate !== null ? convRate - lastYear.convRate : null
  const aovYoy = hasLastYear && lastYear.aov ? (aov - lastYear.aov) / lastYear.aov * 100 : null

  return (
    <div style={{ border: `2px solid ${ORANGE}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: ORANGE, marginBottom: 10 }}>🎯 목표 대비 · 전년 비교</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <TargetTile
          label="매출" valueText={fmt억(revenue)}
          pct={revenuePct} targetText={fmt억(revenueTarget)} color={ORANGE}
          yoyValue={revenueYoy} yoyKind="pct"
        />
        <TargetTile
          label="전환율" valueText={fmtPct(convRate)}
          pct={convRatePct} targetText={fmtPct(convRateTarget || 0)} color={GREEN}
          yoyValue={convRateYoy} yoyKind="pp"
        />
        <TargetTile
          label="객단가(AOV)" valueText={`${fmtComma(aov)}원`}
          pct={aovPct} targetText={`${fmtComma(aovTarget || 0)}원`} color={BLUE}
          yoyValue={aovYoy} yoyKind="pct"
        />
      </div>
    </div>
  )
}
