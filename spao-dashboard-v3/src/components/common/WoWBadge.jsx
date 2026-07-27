/**
 * WoWBadge — 전주 대비(Week-over-Week) 증감 배지 (공용 컴포넌트)
 *
 * props:
 *   wow      number|null  증감값. null/undefined/비유한수면 렌더 안 함(showNew 시 '신규')
 *   kind     'pct'|'pp'   증감률(%) | 포인트 차이(%p) — 기본 'pct'
 *   invert   boolean      true 면 값이 낮을수록 좋음(취소율·할인율 등) → 색상 반전
 *   showNew  boolean      true 면 전주값 없을 때 '신규' 표기 (기본 false → 미표시)
 *   size     'sm'|'xs'    배지 크기 (기본 'sm')
 *   suffix   string       배지 뒤 보조 문구 (예: 'vs 전주')
 */
export default function WoWBadge({ wow, kind = 'pct', invert = false, showNew = false, size = 'sm', suffix }) {
  if (wow === null || wow === undefined || !isFinite(wow)) {
    if (showNew) {
      return <span style={{ fontSize: size === 'xs' ? '0.625rem' : '0.6875rem', color: '#C8C8C6' }}>신규</span>
    }
    return null
  }
  const up    = wow >= 0
  const good  = invert ? !up : up
  const color = wow === 0 ? '#A0A09E' : good ? '#1A8060' : '#DC2626'
  const bg    = wow === 0 ? '#F8F8F7' : good ? '#F0FDF8' : '#FEF2F2'
  const arrow = wow === 0 ? '–' : up ? '▲' : '▼'
  const sign  = wow > 0 ? '+' : ''
  const unit  = kind === 'pp' ? '%p' : '%'
  const fontSize = size === 'xs' ? '0.625rem' : '0.6875rem'
  const decimals = size === 'xs' ? 0 : 1

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize, fontWeight: 700, color, background: bg,
      borderRadius: 4, padding: size === 'xs' ? '1px 5px' : '2px 7px', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: '0.5rem' }}>{arrow}</span>
      {sign}{wow.toFixed(decimals)}{unit}
      {suffix && <span style={{ color: '#A0A09E', fontWeight: 500 }}>{suffix}</span>}
    </span>
  )
}
