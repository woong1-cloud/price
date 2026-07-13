import { createClient } from '@supabase/supabase-js'

// 환경변수에서 읽음 (.env.local / Vercel 환경변수 / 회사 배포 시스템 환경변수)
const url     = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 둘 다 있을 때만 클라이언트 생성 — 없으면 null (로컬 전용 모드로 자동 폴백)
export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      // 실제 로그인(Supabase Auth) 도입: 세션을 브라우저에 유지하고 토큰 자동 갱신.
      // 로그인하면 모든 요청이 그 사용자(JWT) 신분으로 나가 RLS(authenticated) 보호를 받는다.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const cloudEnabled = !!supabase
