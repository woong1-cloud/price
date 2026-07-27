import { useState } from 'react'
import { supabase } from '../lib/supabase'

// 로그인 사용자가 본인 비밀번호를 변경 (Supabase Auth updateUser).
// 새 비밀번호는 Supabase 인증 영역에 해시로 저장된다.
export default function PasswordChange() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)   // { type: 'ok'|'err', text }

  const reset = () => { setPw(''); setPw2(''); setMsg(null); setBusy(false) }
  const close = () => { setOpen(false); reset() }

  const submit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (pw.length < 6) { setMsg({ type: 'err', text: '비밀번호는 6자 이상이어야 합니다.' }); return }
    if (pw !== pw2)   { setMsg({ type: 'err', text: '두 비밀번호가 일치하지 않습니다.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) {
      setMsg({ type: 'err', text: error.message || '변경에 실패했습니다. 다시 시도하세요.' })
    } else {
      setMsg({ type: 'ok', text: '비밀번호가 변경되었습니다.' })
      setPw(''); setPw2('')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="비밀번호 변경"
        style={{
          position: 'fixed', left: 16, bottom: 52, zIndex: 250,
          padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
          border: '1px solid #E8E8E6', background: '#fff', color: '#6B6B68',
          fontSize: '0.6875rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        }}
      >
        🔑 비밀번호 변경
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={submit}
            style={{
              background: '#fff', borderRadius: 14, padding: '28px 26px', width: '100%', maxWidth: 360,
              display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A' }}>비밀번호 변경</div>
            <input
              type="password" value={pw} autoFocus autoComplete="new-password"
              onChange={e => { setPw(e.target.value); setMsg(null) }}
              placeholder="새 비밀번호 (6자 이상)"
              style={{ padding: '11px 14px', borderRadius: 10, fontSize: '0.9375rem', border: '1px solid #E8E8E6', outline: 'none' }}
            />
            <input
              type="password" value={pw2} autoComplete="new-password"
              onChange={e => { setPw2(e.target.value); setMsg(null) }}
              placeholder="새 비밀번호 확인"
              style={{ padding: '11px 14px', borderRadius: 10, fontSize: '0.9375rem', border: '1px solid #E8E8E6', outline: 'none' }}
            />
            {msg && (
              <div style={{ fontSize: '0.8125rem', color: msg.type === 'ok' ? '#1A8060' : '#DC2626' }}>
                {msg.type === 'ok' ? '✓ ' : ''}{msg.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={close} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #E8E8E6',
                background: '#F8F8F7', color: '#6B6B68', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              }}>닫기</button>
              <button type="submit" disabled={busy} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: busy ? '#9BC3EC' : '#378ADD', color: '#fff', fontSize: '0.875rem', fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
              }}>{busy ? '변경 중…' : '변경'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
