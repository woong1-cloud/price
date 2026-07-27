import { useState, useEffect, useCallback } from 'react'
import { getDailyIngestStatus } from '../utils/storage'

// 일자별 자동 적재(daily_* 스테이징) 상태를 보여주는 배지.
// ⚠ 아직 daily_* → weekly_snapshots 롤업이 없어 "화면(주차) 데이터"와는 무관한 참고 정보다.
export default function IngestStatusBadge() {
  const [status, setStatus] = useState(null) // null=로딩전, 'loading', 또는 결과 객체
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getDailyIngestStatus()
    setStatus(r)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (status === null && !loading) return null

  const has = status && status.datasetsToday > 0
  const timeLabel = status?.lastIngestedAt
    ? new Date(status.lastIngestedAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <span
      title="일자별 자동 수집 현황(참고용) — 아직 이 대시보드 화면 데이터와는 별개입니다"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.6875rem', fontWeight: 600, borderRadius: 12, padding: '3px 10px',
        border: `1px solid ${has ? '#BBF7D0' : '#E8E8E6'}`,
        background: has ? '#F0FDF8' : '#F8F8F7',
        color: has ? '#1A8060' : '#A0A09E',
      }}
    >
      🤖 자동 수집
      {loading ? (
        '확인 중…'
      ) : has ? (
        <>오늘 {status.datasetsToday}/{status.totalDatasets}종{timeLabel ? ` · ${timeLabel}` : ''}</>
      ) : (
        '오늘 수집 없음'
      )}
      <button
        onClick={load}
        title="새로고침"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: '0.6875rem', lineHeight: 1 }}
      >⟳</button>
    </span>
  )
}
