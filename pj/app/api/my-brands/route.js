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
    if (memberError || !member || !member.is_active) {
      throw new ApiError(403, '유효하지 않은 사용자입니다.');
    }

    if (member.is_global_admin) {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return Response.json({ brands: data });
    }

    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('brand:brands(id, name, code, is_active)')
      .eq('team_member_id', memberId);
    if (error) throw error;
    const brands = (data ?? [])
      .map((row) => row.brand)
      .filter((brand) => brand && brand.is_active);
    return Response.json({ brands });
  } catch (error) {
    return errorResponse(error);
  }
}
