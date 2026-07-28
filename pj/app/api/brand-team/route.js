// app/api/brand-team/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('id, tier, sub_role, team_member:team_members(id, name, is_active)')
      .eq('brand_id', brandId)
      .order('tier', { ascending: false });
    if (error) throw error;

    const members = (data ?? []).map((row) => ({
      roleId: row.id,
      tier: row.tier,
      subRole: row.sub_role,
      id: row.team_member.id,
      name: row.team_member.name,
      isActive: row.team_member.is_active,
    }));
    return Response.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { brandId, targetMemberId, tier, subRole } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (!targetMemberId) throw new ApiError(400, 'targetMemberId가 필요합니다.');
    if (!['2차', '3차'].includes(tier)) throw new ApiError(400, '유효하지 않은 tier입니다.');
    if (subRole && !['기획', '개발', '뷰어'].includes(subRole)) {
      throw new ApiError(400, '유효하지 않은 역할입니다.');
    }

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_brand_roles')
      .insert({ team_member_id: targetMemberId, brand_id: brandId, tier, sub_role: subRole || null });
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 이 브랜드에 배치된 팀원입니다.');
      throw error;
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
