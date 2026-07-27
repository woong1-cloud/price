import { createClient } from '@supabase/supabase-js'

const url     = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function isValidUrl(value) {
  try { new URL(value); return true } catch { return false }
}

export const supabase = (url && anonKey && isValidUrl(url))
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const cloudEnabled = !!supabase
