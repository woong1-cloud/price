import SparkLine from './SparkLine'
import { fmtWoW } from '../../utils/metrics'

// 신호등 색상: wow > 0 → green, wow < 0 → red, null → neutral
function wowColor(wow) {
  if (wow === null || wow === undefined) return '#A0A09E'
  if (wow > 0) return '#1A8060'
  if (wow < 0) return '#DC2626'
  return '#A0A09E'
}

function wowBg(wow) {
  if (wow === null || wow === undefined) return '#F8F8F7'
  if (wow > 0) return '#F0FDF8'
  if (wow < 0) return '#FEF2F2'
  return '#F8F8F7'
}

export default function KPICard({ kpi }) {
  const { label, value, wow, sparkData, color } = kpi
  const formatted = fmtWoW(wow)
  const arrowChar = wow > 0 ? '▲' : wow < 0 ? '▼' : '–'

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #F0F0EE',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minWidth: 0,
    }}>
      {/* 라벨 */}
      <div style={{ fontSize: '0.75rem', color: '#A0A09E', fontWeight: 500 }}>{label}</div>

      {/* 값 + 스파크라인 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: '1.5rem', color: '#1A1A1A', lineHeight: 1 }}>{value}</div>
        {sparkData && sparkData.length > 0 && (
          <SparkLine data={sparkData} color={color} height={36} />
        )}
      </div>

      {/* WoW 배지 */}
      {formatted !== null ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: wowBg(wow), borderRadius: 6, padding: '4px 10px',
          alignSelf: 'flex-start',
        }}>
          <span style={{ fontSize: '0.6875rem', color: wowColor(wow), fontWeight: 700 }}>
            {arrowChar} {formatted}
          </span>
          <span style={{ fontSize: '0.625rem', color: '#A0A09E' }}>전주 대비</span>
        </div>
      ) : (
        <div style={{ fontSize: '0.6875rem', color: '#C8C8C6' }}>전주 데이터 없음</div>
      )}
    </div>
  )
}
