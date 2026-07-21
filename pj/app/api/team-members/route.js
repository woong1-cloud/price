import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, is_global_admin')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return Response.json({ teamMembers: data });
  } catch (error) {
    return errorResponse(error);
  }
}
