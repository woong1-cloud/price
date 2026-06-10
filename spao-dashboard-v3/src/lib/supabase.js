import { createClient } from '@supabase/supabase-js'

// 환경변수에서 읽음 (.env.local / Vercel 환경변수 / 회사 배포 시스템 환경변수)
const url     = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 둘 다 있을 때만 클라이언트 생성 — 없으면 null (로컬 전용 모드로 자동 폴백)
export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      auth: { persistSession: false },   // 공유 비밀번호 방식이라 Supabase 세션은 불필요
    })
  : null

export const cloudEnabled = !!supabase
