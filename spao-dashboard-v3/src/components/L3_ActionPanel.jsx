import StatusBadge from './common/StatusBadge'

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2, success: 3 }

function InsightCard({ insight }) {
  const { severity, title, desc, action } = insight
  const borderColor = {
    danger:  '#FECACA',
    warning: '#FDE68A',
    info:    '#BFDBFE',
    success: '#BBF7D0',
  }[severity] || '#E8E8E6'

  const iconMap = {
    danger: '🚨', warning: '⚠️', info: 'ℹ️', success: '✅',
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: `1px solid ${borderColor}`,
      borderLeft: `4px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{iconMap[severity]}</span>
        <StatusBadge severity={severity} label={severity === 'danger' ? '즉시 조치' : severity === 'warning' ? '주의' : severity === 'success' ? '긍정 신호' : '정보'} />
        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1A1A1A' }}>{title}</span>
      </div>

      <div style={{ fontSize: '0.875rem', color: '#6B6B68', lineHeight: 1.6 }}>{desc}</div>

      <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#378ADD', flexShrink: 0 }}>→ 액션</span>
        <span style={{ fontSize: '0.8125rem', color: '#1A1A1A', lineHeight: 1.5 }}>{action}</span>
      </div>
    </div>
  )
}

/* ── 빈 상태 ── */
function NoInsights() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#A0A09E' }}>
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#6B6B68', marginBottom: 6 }}>
        특이 신호 없음
      </div>
      <div style={{ fontSize: '0.875rem' }}>
        모든 KPI가 정상 범위 내에 있습니다. 다음 주 데이터를 기다려 주세요.
      </div>
    </div>
  )
}

/* ── L3 메인 ── */
export default function L3_ActionPanel({ derived }) {
  const { insights = [] } = derived

  const sorted = [...insights].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  )

  const counts = {
    danger:  sorted.filter(i => i.severity === 'danger').length,
    warning: sorted.filter(i => i.severity === 'warning').length,
    success: sorted.filter(i => i.severity === 'success').length,
    info:    sorted.filter(i => i.severity === 'info').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 요약 배지 */}
      {sorted.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {counts.danger  > 0 && <StatusBadge severity="danger"  label={`즉시 조치 ${counts.danger}건`} />}
          {counts.warning > 0 && <StatusBadge severity="warning" label={`주의 ${counts.warning}건`} />}
          {counts.success > 0 && <StatusBadge severity="success" label={`긍정 신호 ${counts.success}건`} />}
          {counts.info    > 0 && <StatusBadge severity="info"    label={`참고 ${counts.info}건`} />}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card">
          <NoInsights />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* 액션 안내 */}
      <div style={{ background: '#F8F8F7', borderRadius: 10, padding: '14px 18px', fontSize: '0.8125rem', color: '#A0A09E', lineHeight: 1.7 }}>
        <strong style={{ color: '#6B6B68' }}>ℹ 자동 감지 조건 안내</strong><br />
        매출 급락/급등(±10~20%), 장바구니 전환율 5% 미만, 비회원 비중 40% 초과, 스타일코드 매칭 80% 미만,
        PV 갭 5%p 초과, 이탈률 38% 초과, APP 탐색 깊이 우위, 전환율 5% 초과 페이지,
        IP 매출 비중 30% 초과, 여성 고객 쏠림 70% 초과, 구매 고객 감소(-10%) 등을 감지합니다.
      </div>
    </div>
  )
}
