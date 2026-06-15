// 데이터 품질 경고 상단 통합 스트립.
// checkDataQuality 가 반환한 경고 목록을 헤더 아래 작은 띠로 표시한다.
// 경고가 없으면 아무것도 렌더링하지 않는다.
export default function DataQualityBanner({ warnings = [] }) {
  if (!warnings.length) return null

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '12px 24px 0' }}>
      <div
        style={{
          background: '#FFF9F0',
          border: '1px solid #FDE68A',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: '0.75rem',
          color: '#92400E',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: warnings.length ? 6 : 0 }}>
          <span>⚠ 데이터 점검</span>
          <span style={{ fontWeight: 400, color: '#B45309' }}>
            원본 데이터에 이상이 의심되는 항목이 {warnings.length}건 있습니다.
          </span>
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {warnings.map((w) => (
            <li key={w.id} style={{ lineHeight: 1.5 }}>{w.message}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
