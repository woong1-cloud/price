import { useState } from 'react'
import { deleteSnapshot, updateSnapshotMeta } from '../utils/storage'

// 주차 관리 모달 — 라벨 수정 / 삭제 (Phase 4)
export default function SnapshotManageModal({ index, onClose, onChanged }) {
  const [editing, setEditing] = useState(null)   // week_key 편집 중
  const [labelDraft, setLabelDraft] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [err, setErr] = useState(null)

  const startEdit = (r) => { setEditing(r.week_key); setLabelDraft(r.week_label); setErr(null) }

  const saveLabel = async (weekKey) => {
    setBusyKey(weekKey); setErr(null)
    const r = await updateSnapshotMeta(weekKey, { weekLabel: labelDraft.trim() || weekKey })
    setBusyKey(null)
    if (r.ok) { setEditing(null); onChanged?.() }
    else setErr(`수정 실패: ${r.reason}`)
  }

  const doDelete = async (weekKey) => {
    setBusyKey(weekKey); setErr(null)
    const r = await deleteSnapshot(weekKey)
    setBusyKey(null)
    if (r.ok) { setConfirmDelete(null); onChanged?.() }
    else setErr(`삭제 실패: ${r.reason}`)
  }

  const fmtRange = (r) => r.week_start
    ? `${r.week_start.slice(5).replace('-', '.')}${r.week_end ? '~' + r.week_end.slice(5).replace('-', '.') : ''}`
    : ''

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, padding: 24, width: 520, maxWidth: '100%',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#1A1A1A' }}>⚙ 주차 관리</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#A0A09E' }}>×</button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '0.8125rem', color: '#A0A09E' }}>
          누적된 {index.length}개 주차. 라벨을 수정하거나 삭제할 수 있습니다.
        </p>

        {err && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', fontSize: '0.75rem' }}>{err}</div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {index.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#A0A09E', fontSize: '0.8125rem' }}>저장된 주차가 없습니다.</div>
          )}
          {index.map(r => (
            <div key={r.week_key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px',
              borderBottom: '1px solid #F1F3F5',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing === r.week_key ? (
                  <input autoFocus value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveLabel(r.week_key) }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6, border: '1px solid #378ADD', fontSize: '0.8125rem' }} />
                ) : (
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1A1A1A' }}>{r.week_label}</div>
                )}
                <div style={{ fontSize: '0.6875rem', color: '#A0A09E', marginTop: 2 }}>
                  {r.week_key} · {fmtRange(r)} · {(r.files_present || []).length}종
                </div>
              </div>

              {editing === r.week_key ? (
                <>
                  <button onClick={() => saveLabel(r.week_key)} disabled={busyKey === r.week_key} style={btn('#378ADD', '#fff')}>저장</button>
                  <button onClick={() => setEditing(null)} style={btn('#F8F8F7', '#6B6B68', '#E8E8E6')}>취소</button>
                </>
              ) : confirmDelete === r.week_key ? (
                <>
                  <span style={{ fontSize: '0.6875rem', color: '#DC2626' }}>삭제?</span>
                  <button onClick={() => doDelete(r.week_key)} disabled={busyKey === r.week_key} style={btn('#E24B4A', '#fff')}>
                    {busyKey === r.week_key ? '…' : '확인'}
                  </button>
                  <button onClick={() => setConfirmDelete(null)} style={btn('#F8F8F7', '#6B6B68', '#E8E8E6')}>취소</button>
                </>
              ) : (
                <>
                  <button onClick={() => startEdit(r)} style={btn('#F5F3FF', '#6D28D9', '#C4B5FD')}>라벨</button>
                  <button onClick={() => setConfirmDelete(r.week_key)} style={btn('#FEE2E2', '#DC2626', '#FCA5A5')}>삭제</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 20, border: '1px solid #E8E8E6', background: '#fff',
            color: '#6B6B68', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
          }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function btn(bg, color, border) {
  return {
    flexShrink: 0, padding: '5px 12px', borderRadius: 14,
    border: `1px solid ${border || bg}`, background: bg, color,
    fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer',
  }
}
