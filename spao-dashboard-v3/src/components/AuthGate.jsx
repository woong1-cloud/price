import { useState, useEffect } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import PasswordChange from './PasswordChange'

// 실제 로그인(Supabase Auth, 이메일+비밀번호) 게이트.
// - 로그인하면 children(대시보드) 렌더 + 우하단에 로그아웃 버튼.
// - 클라우드 미설정(로컬 전용) 시엔 게이트 없이 통과.
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!cloudEnabled) { setChecking(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // 클라우드 미설정 → 로컬 전용 모드(게이트 없음)
  if (!cloudEnabled) return children

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A09E', background: '#F1F3F5' }}>
        불러오는 중…
      </div>
    )
  }

  if (session) {
    return (
      <>
        {children}
        <PasswordChange />
        <button
          onClick={() => supabase.auth.signOut()}
          title="로그아웃"
          style={{
            position: 'fixed', left: 16, bottom: 16, zIndex: 250,
            padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
            border: '1px solid #E8E8E6', background: '#fff', color: '#6B6B68',
            fontSize: '0.6875rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          }}
        >
          로그아웃 ({session.user?.email})
        </button>
      </>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) setError('이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F1F3F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 380,
        display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔒</div>
          <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ background: '#378ADD', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>v3</span>
            SPAO 주간 실적 대시보드
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: '#A0A09E' }}>계정으로 로그인하세요</p>
        </div>

        <input
          type="email" value={email} autoFocus autoComplete="username"
          onChange={e => { setEmail(e.target.value); setError('') }}
          placeholder="이메일"
          style={{ padding: '11px 14px', borderRadius: 10, fontSize: '0.9375rem', border: '1px solid #E8E8E6', outline: 'none' }}
        />
        <input
          type="password" value={pw} autoComplete="current-password"
          onChange={e => { setPw(e.target.value); setError('') }}
          placeholder="비밀번호"
          style={{ padding: '11px 14px', borderRadius: 10, fontSize: '0.9375rem', border: `1px solid ${error ? '#FCA5A5' : '#E8E8E6'}`, outline: 'none', background: error ? '#FEF2F2' : '#fff' }}
        />

        {error && <div style={{ fontSize: '0.8125rem', color: '#DC2626', marginTop: -4 }}>{error}</div>}

        <button type="submit" disabled={busy} style={{
          padding: '12px 16px', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
          background: busy ? '#9BC3EC' : '#378ADD', color: '#fff', fontSize: '0.9375rem', fontWeight: 700,
        }}>
          {busy ? '로그인 중…' : '로그인'}
        </button>

        <div style={{ fontSize: '0.6875rem', color: '#C8C8C6', lineHeight: 1.6 }}>
          사내 공유용 대시보드입니다. 계정은 데이터 담당자에게 문의하세요.
        </div>
      </form>
    </div>
  )
}
