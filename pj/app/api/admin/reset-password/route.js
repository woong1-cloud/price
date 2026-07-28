import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function POST(request) {
  try {
    await requireGlobalAdmin();

    const body = await request.json();
    const { targetMemberId, password } = body;
    if (!targetMemberId || !password) throw new ApiError(400, 'targetMemberId, password가 필요합니다.');
    if (password.length < 8) throw new ApiError(400, '비밀번호는 8자 이상이어야 합니다.');

    const supabase = getSupabaseAdmin();
    const { data: target, error: targetError } = await supabase
      .from('team_members')
      .select('id, auth_user_id')
      .eq('id', targetMemberId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new ApiError(404, '팀원을 찾을 수 없습니다.');
    if (!target.auth_user_id) throw new ApiError(400, '아직 계정이 없는 팀원입니다.');

    // must_change_password를 먼저 세팅한다 — 순서를 반대로 하면(비밀번호부터 바꾸고
    // 이 업데이트가 실패하는 경우) 비밀번호는 이미 바뀌었는데 강제 재설정 플래그는
    // 안 켜지는 "성공한 것처럼 보이지만 조용히 안전장치가 빠진" 상태가 된다.
    // 이 순서면 실패 시 최악의 경우도 "플래그만 켜지고 비밀번호는 그대로"라
    // 안전한 쪽으로 실패한다.
    const { data: updated, error: updateError } = await supabase
      .from('team_members')
      .update({ must_change_password: true })
      .eq('id', targetMemberId)
      .select()
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new ApiError(404, '팀원을 찾을 수 없습니다.');

    const { error: authError } = await supabase.auth.admin.updateUserById(target.auth_user_id, { password });
    if (authError) throw new ApiError(400, authError.message);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
