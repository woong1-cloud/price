import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { checkLastGlobalAdmin } from '@/lib/checkLastGlobalAdmin';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, isActive, isGlobalAdmin } = body;

    await requireGlobalAdmin();

    const supabase = getSupabaseAdmin();

    if (isGlobalAdmin === false || isActive === false) {
      const { data: teamMembers, error: listError } = await supabase
        .from('team_members')
        .select('id, is_global_admin, is_active');
      if (listError) throw listError;
      if (checkLastGlobalAdmin({ teamMembers, targetMemberId: id })) {
        throw new ApiError(400, '이 시스템의 마지막 전체 관리자는 해제하거나 강등할 수 없습니다.');
      }
    }

    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, '이름은 필수입니다.');
      updates.name = name.trim();
    }
    if (isActive !== undefined) updates.is_active = isActive;
    if (isGlobalAdmin !== undefined) updates.is_global_admin = isGlobalAdmin;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const { data, error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '팀원을 찾을 수 없습니다.');
    return Response.json({ teamMember: data });
  } catch (error) {
    return errorResponse(error);
  }
}
