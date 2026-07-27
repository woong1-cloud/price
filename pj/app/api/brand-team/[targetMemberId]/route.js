// app/api/brand-team/[targetMemberId]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { checkLastBrandAdmin } from '@/lib/checkLastBrandAdmin';

const LAST_ADMIN_MESSAGE = '이 브랜드의 마지막 2차 관리자는 해제하거나 강등할 수 없습니다.';

export async function PATCH(request, { params }) {
  try {
    const { targetMemberId } = await params;
    const body = await request.json();
    const { brandId, tier, subRole } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (tier !== undefined && !['2차', '3차'].includes(tier)) {
      throw new ApiError(400, '유효하지 않은 tier입니다.');
    }
    if (subRole !== undefined && subRole !== null && !['기획', '개발', '뷰어'].includes(subRole)) {
      throw new ApiError(400, '유효하지 않은 역할입니다.');
    }

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();

    if (tier === '3차') {
      const { data: roles, error: rolesError } = await supabase
        .from('user_brand_roles')
        .select('team_member_id, brand_id, tier')
        .eq('brand_id', brandId);
      if (rolesError) throw rolesError;
      if (checkLastBrandAdmin({ roles, targetMemberId, brandId })) {
        throw new ApiError(400, LAST_ADMIN_MESSAGE);
      }
    }

    const updates = {};
    if (tier !== undefined) updates.tier = tier;
    if (subRole !== undefined) updates.sub_role = subRole || null;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const { data, error } = await supabase
      .from('user_brand_roles')
      .update(updates)
      .eq('team_member_id', targetMemberId)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '배치 정보를 찾을 수 없습니다.');
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { targetMemberId } = await params;
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: roles, error: rolesError } = await supabase
      .from('user_brand_roles')
      .select('team_member_id, brand_id, tier')
      .eq('brand_id', brandId);
    if (rolesError) throw rolesError;
    if (checkLastBrandAdmin({ roles, targetMemberId, brandId })) {
      throw new ApiError(400, LAST_ADMIN_MESSAGE);
    }

    const { error } = await supabase
      .from('user_brand_roles')
      .delete()
      .eq('team_member_id', targetMemberId)
      .eq('brand_id', brandId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
