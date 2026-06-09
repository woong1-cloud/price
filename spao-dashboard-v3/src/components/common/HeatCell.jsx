// 히트맵 셀: ratio(0~1) → #E6F1FB(낮음) → #378ADD(높음)
export function heatColor(ratio) {
  const r = Math.round(230 + ratio * (55 - 230))
  const g = Math.round(241 + ratio * (138 - 241))
  const b = Math.round(251 + ratio * (221 - 251))
  return `rgb(${r},${g},${b})`
}

export default function HeatCell({ value, maxValue, children, style = {} }) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0
  const bg = heatColor(ratio)
  const textColor = ratio > 0.6 ? '#fff' : '#1A1A1A'

  return (
    <div style={{
      background: bg,
      borderRadius: 8,
      padding: '10px 8px',
      textAlign: 'center',
      color: textColor,
      position: 'relative',
      ...style,
    }}>
      {children}
    </div>
  )
}
