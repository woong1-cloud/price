import { useState, useEffect } from 'react'

// 스크롤이 일정 이상 내려가면 나타나는 "맨 위로" 플로팅 버튼.
// 페이지(window) 스크롤 기준. 모든 탭(L1~L4)에서 공통 동작.
export default function ScrollToTopButton({ threshold = 600 }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="맨 위로 이동"
      title="맨 위로"
      style={{
        position: 'fixed', right: 28, bottom: 28, zIndex: 300,
        width: 46, height: 46, borderRadius: '50%', cursor: 'pointer',
        border: '1px solid #BFDBFE', background: '#378ADD', color: '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.25rem', lineHeight: 1, fontWeight: 700,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#1D4ED8' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#378ADD' }}
    >
      ↑
    </button>
  )
}
