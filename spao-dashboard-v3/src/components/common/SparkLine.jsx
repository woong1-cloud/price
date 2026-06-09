// 미니 스파크라인 바 차트 (2개 데이터: 지난주 vs 이번주)
export default function SparkLine({ data = [], color = '#378ADD', height = 32 }) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data, 1)
  const barW = 12
  const gap  = 6
  const totalW = data.length * barW + (data.length - 1) * gap

  return (
    <svg width={totalW} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {data.map((v, i) => {
        const barH = Math.max(3, (v / max) * height)
        const x = i * (barW + gap)
        const y = height - barH
        const isLast = i === data.length - 1
        return (
          <rect
            key={i}
            x={x} y={y}
            width={barW} height={barH}
            rx={3}
            fill={isLast ? color : `${color}55`}
          />
        )
      })}
    </svg>
  )
}
