import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const { memberId, isGlobalAdmin } = await getSessionMember({ allowPendingPasswordChange: true });

    const supabase = getSupabaseAdmin();
    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, name, must_change_password')
      .eq('id', memberId)
      .single();
    if (error) throw error;

    return Response.json({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin,
      mustChangePassword: member.must_change_password,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
