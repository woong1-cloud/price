import { useState, useEffect, useMemo } from 'react'
import { deriveWeekKey, deriveFromDate } from '../utils/weekKey'
import { loadSnapshotIndex, upsertSnapshot } from '../utils/storage'

// 주차 스냅샷 저장 모달.
// 사용자는 "이 데이터가 속한 날짜" 하나만 고르면 week_key·라벨·기간이 자동 계산된다.
// (ISO 주차 번호를 손으로 고치다 실수하는 일을 막기 위함)
export default function SnapshotSaveModal({ period, payload, filesPresent = [], onClose, onSaved }) {
  const auto = useMemo(() => deriveWeekKey(period), [period])

  // 기준 날짜: 자동 인식되면 그 주의 시작일, 아니면 오늘.
  const initialDate = auto.ok && auto.weekStart
    ? auto.weekStart
    : new Date().toISOString().slice(0, 10)

  const [pickedDate, setPickedDate] = useState(initialDate)
  const [labelDraft, setLabelDraft] = useState('')   // 사용자가 직접 고친 라벨 (빈 값이면 자동)
  const [index, setIndex] = useState([])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { ok, reason }

  useEffect(() => { loadSnapshotIndex().then(setIndex) }, [])

  // 선택한 날짜로부터 주차 자동 계산
  const derived = useMemo(() => deriveFromDate(pickedDate), [pickedDate])

  // 라벨: 사용자가 직접 입력했으면 그 값, 아니면 자동 계산 라벨을 따라간다.
  const weekLabel = labelDraft !== '' ? labelDraft : (derived.weekLabel || '')

  // 날짜를 일 단위로 이동 (주 이동 버튼용)
  const shiftDays = (n) => {
    const d = new Date(pickedDate)
    if (isNaN(d)) return
    d.setDate(d.getDate() + n)
    setPickedDate(d.toISOString().slice(0, 10))
  }

  const weekKey = derived.weekKey
  const existing = index.find(r => r.week_key === weekKey)
  const keyValid = derived.ok

  const fmtMD = (s) => (s ? s.slice(5).replace('-', '.') : '')

  const handleSave = async () => {
    if (!keyValid) return
    setSaving(true)
    setResult(null)
    const r = await upsertSnapshot({
      weekKey,
      weekLabel: weekLabel.trim() || weekKey,
      weekStart: derived.weekStart || null,
      weekEnd: derived.weekEnd || null,
      payload,
      filesPresent,
      updatedBy: null,
    })
    setSaving(false)
    setResult(r)
    if (r.ok) {
      onSaved?.(weekKey)
      setTimeout(() => onClose?.(), 700)
    }
  }

  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#6B6B68', marginBottom: 4 }
  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
    border: '1px solid #E8E8E6', fontSize: '0.875rem', color: '#1A1A1A',
  }
  const navBtn = {
    flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E8E6',
    background: '#F8F8F7', color: '#6B6B68', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: '1.25rem' }}>📸</span>
          <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#1A1A1A' }}>주차 스냅샷 저장</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '0.8125rem', color: '#A0A09E' }}>
          이 데이터가 속한 <strong style={{ color: '#6B6B68' }}>날짜만 고르면</strong> 주차가 자동으로 계산됩니다.
          이전 주 데이터라면 날짜를 그 주로 옮기거나 “◀ 이전 주”를 누르세요.
        </p>

        {period && (
          <div style={{ fontSize: '0.75rem', color: '#6B6B68', marginBottom: 14 }}>
            파일에서 인식한 기간: <strong style={{ color: '#1A1A1A' }}>{period || '없음'}</strong>
            {!auto.ok && <span style={{ color: '#B45309', marginLeft: 6 }}>· 자동 인식 실패, 날짜를 직접 선택하세요</span>}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={labelStyle}>이 데이터가 속한 날짜</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button style={navBtn} onClick={() => shiftDays(-7)}>◀ 이전 주</button>
              <input type="date" style={{ ...inputStyle, flex: 1 }} value={pickedDate}
                onChange={e => setPickedDate(e.target.value)} />
              <button style={navBtn} onClick={() => shiftDays(7)}>다음 주 ▶</button>
            </div>
          </div>

          {/* 자동 계산 결과 — 확인용 (읽기 전용) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE',
          }}>
            <span style={{ fontSize: '1.25rem' }}>📅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#1D4ED8' }}>
                {derived.ok ? `${derived.weekKey}` : '날짜를 선택하세요'}
              </div>
              {derived.ok && (
                <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginTop: 2 }}>
                  {fmtMD(derived.weekStart)} ~ {fmtMD(derived.weekEnd)} (월~일)
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={labelStyle}>표시 라벨 <span style={{ color: '#A0A09E', fontWeight: 400 }}>(목록에 보일 이름)</span></div>
            <input style={inputStyle} value={weekLabel}
              onChange={e => setLabelDraft(e.target.value)}
              placeholder="예: 6월 1주" />
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#6B6B68', marginTop: 12 }}>
          포함 파일 {filesPresent.length}종: <span style={{ color: '#1A8060' }}>{filesPresent.join(', ') || '없음'}</span>
        </div>

        {existing && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: '#FFF9F0', border: '1px solid #FDE68A', color: '#B45309', fontSize: '0.75rem',
          }}>
            ⚠ <strong>{existing.week_key}</strong> ({existing.week_label}) 가 이미 있습니다. 저장하면 <strong>덮어쓰기</strong> 됩니다.
            <br />다른 주 데이터라면 위에서 날짜를 옮겨 주세요.
          </div>
        )}

        {result && !result.ok && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', fontSize: '0.75rem' }}>
            저장 실패: {result.reason}
          </div>
        )}
        {result && result.ok && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#F0FDF8', color: '#1A8060', fontSize: '0.75rem' }}>
            ✓ 저장되었습니다
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 20, border: '1px solid #E8E8E6', background: '#fff',
            color: '#6B6B68', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
          }}>취소</button>
          <button onClick={handleSave} disabled={!keyValid || saving} style={{
            padding: '8px 18px', borderRadius: 20, border: 'none',
            background: keyValid && !saving ? '#378ADD' : '#C8C8C6',
            color: '#fff', fontSize: '0.8125rem', fontWeight: 700,
            cursor: keyValid && !saving ? 'pointer' : 'not-allowed',
          }}>
            {saving ? '저장 중…' : existing ? '덮어쓰기 저장' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
