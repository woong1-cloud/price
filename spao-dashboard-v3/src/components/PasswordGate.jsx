import { useState } from 'react'

// 단일 공유 비밀번호 (환경변수). 미설정 시 게이트 자동 해제 → 로컬/개발 편의
const ACCESS_PW = import.meta.env.VITE_ACCESS_PASSWORD || ''
const SS_KEY = 'spao_v3_auth'

export default function PasswordGate({ children }) {
  const [authed, setAuthed] = useState(
    () => !ACCESS_PW || sessionStorage.getItem(SS_KEY) === '1'
  )
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  if (authed) return children

  const submit = (e) => {
    e.preventDefault()
    if (value === ACCESS_PW) {
      sessionStorage.setItem(SS_KEY, '1')
      setAuthed(true)
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F1F3F5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 380,
        display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔒</div>
          <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ background: '#378ADD', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>v3</span>
            SPAO 주간 실적 대시보드
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: '#A0A09E' }}>
            팀 공유 비밀번호를 입력하세요
          </p>
        </div>

        <input
          type="password"
          value={value}
          autoFocus
          onChange={e => { setValue(e.target.value); setError(false) }}
          placeholder="비밀번호"
          style={{
            padding: '12px 16px', borderRadius: 10, fontSize: '0.9375rem',
            border: `1px solid ${error ? '#FCA5A5' : '#E8E8E6'}`,
            outline: 'none', textAlign: 'center', letterSpacing: '0.1em',
            background: error ? '#FEF2F2' : '#fff',
          }}
        />

        {error && (
          <div style={{ fontSize: '0.8125rem', color: '#DC2626', marginTop: -8 }}>
            비밀번호가 일치하지 않습니다
          </div>
        )}

        <button type="submit" style={{
          padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: '#378ADD', color: '#fff', fontSize: '0.9375rem', fontWeight: 700,
        }}>
          입장하기
        </button>

        <div style={{ fontSize: '0.6875rem', color: '#C8C8C6', lineHeight: 1.6 }}>
          사내 공유용 대시보드입니다. 비밀번호는 데이터 담당자에게 문의하세요.
        </div>
      </form>
    </div>
  )
}
