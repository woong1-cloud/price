import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, assignee } = body; // assignee: team_member id 또는 null
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    if (assignee) {
      // 담당자는 같은 브랜드 소속(또는 전역관리자)이어야 한다.
      const { data: role } = await supabase
        .from('user_brand_roles')
        .select('id')
        .eq('team_member_id', assignee)
        .eq('brand_id', brandId)
        .maybeSingle();
      const { data: adminMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', assignee)
        .eq('is_global_admin', true)
        .maybeSingle();
      if (!role && !adminMember) {
        throw new ApiError(400, '담당자는 해당 브랜드 소속이어야 합니다.');
      }
    }

    const { error: updError } = await supabase
      .from('requirements')
      .update({ assignee: assignee || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updError) throw updError;

    return Response.json({ ok: true, assignee: assignee || null });
  } catch (error) {
    return errorResponse(error);
  }
}
