// app/api/team-members/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, name, isActive } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, '이름은 필수입니다.');
      updates.name = name.trim();
    }
    if (isActive !== undefined) updates.is_active = isActive;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
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
