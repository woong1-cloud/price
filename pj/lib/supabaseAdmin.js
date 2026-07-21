import 'server-only';
import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}
