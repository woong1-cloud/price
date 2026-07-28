import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const { memberId, isGlobalAdmin } = await getSessionMember();
    const supabase = getSupabaseAdmin();

    if (isGlobalAdmin) {
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
