// severity: 'success' | 'warning' | 'danger' | 'info'
const STYLES = {
  success: { bg: '#F0FDF8', color: '#1A8060', border: '#BBF7D0', dot: '#5DCAA5' },
  warning: { bg: '#FFF9F0', color: '#B45309', border: '#FDE68A', dot: '#EF9F27' },
  danger:  { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', dot: '#E24B4A' },
  info:    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', dot: '#378ADD' },
}

export default function StatusBadge({ severity = 'info', label }) {
  const s = STYLES[severity] || STYLES.info
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: 20, padding: '2px 10px',
      fontSize: '0.6875rem', fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}
