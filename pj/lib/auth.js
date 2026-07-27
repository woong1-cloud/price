import 'server-only';
import { createClient } from './supabaseServer';
import { getSupabaseAdmin } from './supabaseAdmin';
import { ApiError } from './apiError';

// 요청 쿠키의 Supabase 세션을 서버에 재검증하고(auth.getUser()), team_members에서
// 실제 memberId/isGlobalAdmin을 조회한다. Route Handler 안에서만 호출 가능하다
// (next/headers의 cookies()에 의존).
//
// must_change_password가 true인 세션은 기본적으로 차단한다(비밀번호 변경 화면과
// 관련된 API만 allowPendingPasswordChange: true로 예외를 둔다) — 클라이언트의
// /login 화면 리다이렉트만으로는 /api/*를 직접 호출하는 경로를 막을 수 없기 때문.
export async function getSessionMember({ allowPendingPasswordChange = false } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) console.error(authError);
  if (!user) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  const admin = getSupabaseAdmin();
  const { data: member, error } = await admin
    .from('team_members')
    .select('id, is_active, is_global_admin, must_change_password')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active) {
    throw new ApiError(403, '유효하지 않은 사용자입니다.');
  }
  if (member.must_change_password && !allowPendingPasswordChange) {
    throw new ApiError(403, '비밀번호를 먼저 변경해야 합니다.');
  }

  return {
    memberId: member.id,
    isGlobalAdmin: member.is_global_admin,
    mustChangePassword: member.must_change_password,
  };
}
