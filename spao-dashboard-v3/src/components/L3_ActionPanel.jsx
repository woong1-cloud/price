import { useMemo } from 'react'
import StatusBadge from './common/StatusBadge'
import { computeStoreCornerInsights } from '../utils/metrics'

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

/* ── 섹션 헤더 ── */
function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <span style={{ fontSize: '1.125rem' }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1A1A1A' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '0.75rem', color: '#A0A09E', marginTop: 1 }}>{subtitle}</div>}
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

/* ── 구역 데이터 없음 안내 ── */
function NoCornerData() {
  return (
    <div style={{
      background: '#F8F8F7', borderRadius: 10, padding: '16px 20px',
      border: '1px dashed #E8E8E6', color: '#A0A09E', fontSize: '0.875rem',
    }}>
      <span style={{ marginRight: 6 }}>📂</span>
      매장코너 실적 파일을 업로드하면 구역별 효율 인사이트가 여기에 표시됩니다.
    </div>
  )
}

/* ── L4 메인 ── */
export default function L3_ActionPanel({ derived, storeCorner }) {
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

  // 구역별 인사이트 (매장코너 실적 기반)
  const zoneInsights = useMemo(() => computeStoreCornerInsights(storeCorner), [storeCorner])

  const zoneSorted = [...zoneInsights].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  )

  const zoneCounts = {
    danger:  zoneSorted.filter(i => i.severity === 'danger').length,
    warning: zoneSorted.filter(i => i.severity === 'warning').length,
    success: zoneSorted.filter(i => i.severity === 'success').length,
    info:    zoneSorted.filter(i => i.severity === 'info').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── 섹션 1: KPI 기반 인사이트 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionHeader
          icon="📊"
          title="KPI 인사이트"
          subtitle="매출 · 전환 · 고객 · 탐색 데이터 기반 자동 감지"
        />

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
      </div>

      {/* ── 구분선 ── */}
      <div style={{ borderTop: '1px solid #E8E8E6' }} />

      {/* ── 섹션 2: 구역별 효율 인사이트 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionHeader
          icon="🎪"
          title="구역별 효율 인사이트"
          subtitle="기획전·카테고리 매장 노출/클릭/CTR/전환 기반 자동 감지"
        />

        {!storeCorner ? (
          <NoCornerData />
        ) : (
          <>
            {/* 요약 배지 */}
            {zoneSorted.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {zoneCounts.danger  > 0 && <StatusBadge severity="danger"  label={`즉시 조치 ${zoneCounts.danger}건`} />}
                {zoneCounts.warning > 0 && <StatusBadge severity="warning" label={`주의 ${zoneCounts.warning}건`} />}
                {zoneCounts.success > 0 && <StatusBadge severity="success" label={`긍정 신호 ${zoneCounts.success}건`} />}
                {zoneCounts.info    > 0 && <StatusBadge severity="info"    label={`참고 ${zoneCounts.info}건`} />}
              </div>
            )}

            {zoneSorted.length === 0 ? (
              <div className="card">
                <div style={{ textAlign: 'center', padding: '32px 24px', color: '#A0A09E' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🎉</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#6B6B68', marginBottom: 4 }}>구역 특이 신호 없음</div>
                  <div style={{ fontSize: '0.875rem' }}>모든 기획전·카테고리 구역이 정상 범위 내에 있습니다.</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zoneSorted.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 액션 안내 ── */}
      <div style={{ background: '#F8F8F7', borderRadius: 10, padding: '14px 18px', fontSize: '0.8125rem', color: '#A0A09E', lineHeight: 1.7 }}>
        <strong style={{ color: '#6B6B68' }}>ℹ 자동 감지 조건 안내</strong><br />
        <span style={{ fontWeight: 600, color: '#9CA3AF' }}>KPI:</span>{' '}
        매출 급락/급등(±10~20%), 장바구니 전환율 5% 미만, 비회원 비중 40% 초과, 스타일코드 매칭 80% 미만,
        PV 갭 5%p 초과, 이탈률 38% 초과, APP 탐색 깊이 우위, 전환율 5% 초과 페이지,
        IP 매출 비중 30% 초과, 여성 고객 쏠림 70% 초과, 구매 고객 감소(-10%) 등을 감지합니다.<br />
        <span style={{ fontWeight: 600, color: '#9CA3AF' }}>구역:</span>{' '}
        노출 ≥5만이고 CTR 평균 50% 미달 기획전, 1위 기획전 매출 집중도 50% 초과,
        클릭 ≥100이지만 구매자 0 기획전, CTR 3% 초과 우수 기획전, 카테고리 CTR 우위 등을 감지합니다.
      </div>
    </div>
  )
}
