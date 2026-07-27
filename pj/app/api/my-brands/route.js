import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('id, is_active, is_global_admin')
      .eq('id', memberId)
      .single();
    if (memberError) {
      console.error(memberError);
      throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
    }
    if (!member || !member.is_active) {
      throw new ApiError(403, '유효하지 않은 사용자입니다.');
    }

    if (member.is_global_admin) {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      const brands = (data ?? []).map((b) => ({ ...b, tier: '1차' }));
      return Response.json({ brands });
    }

    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('tier, brand:brands(id, name, code, is_active)')
      .eq('team_member_id', memberId);
    if (error) throw error;
    const brands = (data ?? [])
      .filter((row) => row.brand && row.brand.is_active)
      .map((row) => ({
        id: row.brand.id,
        name: row.brand.name,
        code: row.brand.code,
        tier: row.tier,
      }));
    return Response.json({ brands });
  } catch (error) {
    return errorResponse(error);
  }
}
