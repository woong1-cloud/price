import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { TIER_RANK } from '@/lib/tiers';
import { MERGED_STATUS } from '@/lib/statuses';
import { toSignedImageList } from '@/lib/storage';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select(
        '*, requester:team_members!requirements_requester_fkey(id, name), ' +
          'assignee:team_members!requirements_assignee_fkey(id, name), ' +
          'category:brand_categories(id, category_name)'
      )
      .eq('id', id)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, requirement.brand_id, '3차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];
    if (requirement.is_confidential && !canSeeConfidential) {
      throw new ApiError(403, '비공개 요구사항은 조회할 수 없습니다.');
    }

    const { data: history, error: histError } = await supabase
      .from('change_logs')
      .select('id, changed_by, change_type, field_name, old_value, new_value, comment, created_at, ' +
        'changer:team_members!change_logs_changed_by_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (histError) throw histError;

    const { data: duplicates, error: dupError } = await supabase
      .from('duplicate_links')
      .select('id, linked_note, requester:team_members!duplicate_links_linked_requester_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (dupError) throw dupError;

    let mergedInto = null;
    if (requirement.status === MERGED_STATUS) {
      const { data: link } = await supabase
        .from('duplicate_links')
        .select('target:requirements!duplicate_links_requirement_id_fkey(id, title)')
        .like('linked_note', `% (#${id})`)
        .limit(1)
        .maybeSingle();
      if (link?.target) mergedInto = { id: link.target.id, title: link.target.title };
    }

    const { data: imageRows, error: imgError } = await supabase
      .from('requirement_images')
      .select('id, storage_path, content_type, sort_order')
      .eq('requirement_id', id)
      .order('sort_order', { ascending: true });
    if (imgError) throw imgError;
    const images = await toSignedImageList(imageRows);

    return Response.json({ requirement, history, duplicates, mergedInto, images });
  } catch (error) {
    return errorResponse(error);
  }
}
