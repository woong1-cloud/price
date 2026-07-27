import 'server-only';
import { createClient } from './supabaseServer';
import { getSupabaseAdmin } from './supabaseAdmin';
import { ApiError } from './apiError';

// 요청 쿠키의 Supabase 세션을 서버에 재검증하고(auth.getUser()), team_members에서
// 실제 memberId/isGlobalAdmin을 조회한다. Route Handler 안에서만 호출 가능하다
// (next/headers의 cookies()에 의존).
export async function getSessionMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  const admin = getSupabaseAdmin();
  const { data: member, error } = await admin
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active) {
    throw new ApiError(403, '유효하지 않은 사용자입니다.');
  }

  return { memberId: member.id, isGlobalAdmin: member.is_global_admin };
}
