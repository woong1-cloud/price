import { useState, useRef } from 'react'

// 통합 주차 컨트롤 — 주차 선택 = 업로드 = 확인을 한 드롭다운에 담는다.
export default function WeekControl({
  index = [], selectedWeekKey, compareWeekKey, totalFiles = 9,
  onSelectWeek, onNewWeekFiles, onUploadToSelected, onCompareChange, onManage, onEditCurrent,
}) {
  const [open, setOpen] = useState(false)
  const newRef = useRef()
  const upRef = useRef()
  const close = () => setOpen(false)

  const byKey = Object.fromEntries(index.map(r => [r.week_key, r]))
  const selected = selectedWeekKey ? byKey[selectedWeekKey] : null
  const selectedCount = selected ? (selected.files_present || []).length : 0
  const label = selected ? selected.week_label : (index.length ? '주차 선택' : '데이터 없음')

  const fmtRange = (r) => {
    if (!r?.week_start) return ''
    const s = r.week_start.slice(5).replace('-', '.')
    const e = r.week_end ? r.week_end.slice(5).replace('-', '.') : ''
    return e ? `${s}~${e}` : s
  }

  const row = (r) => {
    const active = r.week_key === selectedWeekKey
    const n = (r.files_present || []).length
    return (
      <button key={r.week_key} onClick={() => { onSelectWeek(r.week_key); close() }} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
        background: active ? '#EFF6FF' : 'transparent',
      }}>
        <span style={{ width: 12, flexShrink: 0, color: '#378ADD', fontWeight: 700 }}>{active ? '✓' : ''}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: active ? 700 : 600, color: active ? '#1D4ED8' : '#3A3A38' }}>{r.week_label}</span>
          <span style={{ fontSize: '0.6875rem', color: '#A0A09E', marginLeft: 6 }}>{r.week_key} · {fmtRange(r)}</span>
        </span>
        <span style={{
          fontSize: '0.625rem', fontWeight: 700, flexShrink: 0,
          color: n >= totalFiles ? '#1A8060' : '#B45309',
          background: n >= totalFiles ? '#F0FDF8' : '#FFF9F0',
          border: `1px solid ${n >= totalFiles ? '#BBF7D0' : '#FDE68A'}`,
          borderRadius: 8, padding: '1px 6px',
        }}>{n}/{totalFiles}</span>
      </button>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} title="주차 선택 · 업로드" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderRadius: 16, cursor: 'pointer',
        border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8',
        fontSize: '0.78125rem', fontWeight: 700,
      }}>
        <span>📅 {label}</span>
        {selected && <span style={{ fontSize: '0.625rem', fontWeight: 600 }}>{selectedCount}/{totalFiles}</span>}
        <span style={{ fontSize: '0.625rem' }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 201,
            background: '#fff', border: '1px solid #E8E8E6', borderRadius: 12,
            boxShadow: '0 8px 28px rgba(0,0,0,0.14)', padding: 8, width: 310,
            maxHeight: 460, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#A0A09E', padding: '4px 10px 6px' }}>
              주차 {index.length > 0 ? `${index.length}개 누적` : '없음'}
            </div>

            {/* ＋ 새 주차 추가 */}
            <label style={{
              display: 'block', textAlign: 'center', cursor: 'pointer',
              background: '#F0FDF8', border: '1px dashed #5DCAA5', borderRadius: 8,
              padding: '9px', color: '#1A8060', fontWeight: 700, fontSize: '0.8125rem', marginBottom: 6,
            }}>
              <input ref={newRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files.length) { onNewWeekFiles(Array.from(e.target.files)); close() } }} />
              ＋ 새 주차 추가 (파일 올리기)
            </label>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {index.length === 0 && (
                <div style={{ padding: '14px 10px', fontSize: '0.75rem', color: '#A0A09E' }}>
                  파일을 올리면 주차가 자동으로 쌓입니다.
                </div>
              )}
              {index.map(row)}
            </div>

            {selected && (
              <div style={{ borderTop: '1px solid #F1F3F5', marginTop: 6, paddingTop: 8 }}>
                <div style={{ fontSize: '0.6875rem', color: '#6B6B68', padding: '0 4px 6px' }}>
                  <strong>{selected.week_label}</strong> 에 파일 추가/교체
                </div>
                <label style={{
                  display: 'block', textAlign: 'center', cursor: 'pointer',
                  background: '#378ADD', borderRadius: 8, padding: '8px', color: '#fff',
                  fontWeight: 700, fontSize: '0.8125rem',
                }}>
                  <input ref={upRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
                    onChange={e => { if (e.target.files.length) { onUploadToSelected(Array.from(e.target.files)); close() } }} />
                  📁 파일 업로드 (드롭 또는 선택)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px 0' }}>
                  <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>전주 대비 기준</span>
                  <select value={compareWeekKey || ''} onChange={e => onCompareChange(e.target.value || null)} style={{
                    flex: 1, fontSize: '0.6875rem', padding: '4px 6px', borderRadius: 7,
                    border: '1px solid #E8E8E6', color: '#6B6B68', cursor: 'pointer',
                  }}>
                    <option value="">자동(직전 주)</option>
                    {index.filter(r => r.week_key !== selectedWeekKey).map(r => (
                      <option key={r.week_key} value={r.week_key}>{r.week_label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid #F1F3F5', marginTop: 6, paddingTop: 6, display: 'flex', gap: 6 }}>
              {selected && (
                <button onClick={() => { onEditCurrent(); close() }} style={footBtn}>✏ 주차 정보 수정</button>
              )}
              {index.length > 0 && (
                <button onClick={() => { onManage(); close() }} style={footBtn}>⚙ 관리(이름·삭제)</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const footBtn = {
  flex: 1, padding: '7px 8px', borderRadius: 8, border: '1px solid #E8E8E6',
  background: '#F8F8F7', color: '#6B6B68', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer',
}
