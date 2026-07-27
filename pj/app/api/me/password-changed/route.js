import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function POST() {
  try {
    const { memberId } = await getSessionMember();

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('team_members')
      .update({ must_change_password: false })
      .eq('id', memberId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
