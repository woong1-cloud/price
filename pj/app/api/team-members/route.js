// app/api/team-members/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { getSessionMember } from '@/lib/auth';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    // 목록 조회는 로그인한 모든 팀원이 필요로 한다(요구사항 담당자 표시,
    // 브랜드 설정의 팀 배치 등 1차가 아닌 사용자도 쓰는 화면이 많다) —
    // requireGlobalAdmin이 아니라 세션 존재만 확인한다.
    await getSessionMember();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('team_members')
      .select('id, name, is_active, is_global_admin, auth_user_id')
      .order('name');
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ teamMembers: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name } = body;
    if (!name || !name.trim()) throw new ApiError(400, '이름은 필수입니다.');

    await requireGlobalAdmin();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .insert({ name: name.trim(), is_active: true, is_global_admin: false })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ teamMember: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
