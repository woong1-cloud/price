import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const memberId = searchParams.get('memberId');
    if (!brandId || !memberId) throw new ApiError(400, 'brandId와 memberId가 필요합니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '3차');
    const canSeeConfidential = isGlobalAdmin || tier === '2차';

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('requirements')
      .select(
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, requester:team_members!requirements_requester_fkey(id, name), category:brand_categories(id, category_name)'
      )
      .eq('brand_id', brandId)
      .order('request_date', { ascending: false });

    if (!canSeeConfidential) {
      query = query.eq('is_confidential', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ requirements: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      memberId,
      brandId,
      priority,
      urgency,
      requestDate,
      requester,
      category,
      title,
      asIs,
      toBe,
      note,
      isConfidential,
    } = body;

    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (!title || !title.trim()) throw new ApiError(400, '제목은 필수입니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requirements')
      .insert({
        brand_id: brandId,
        priority: priority || null,
        urgency: urgency || null,
        request_date: requestDate || new Date().toISOString().slice(0, 10),
        requester: requester || null,
        category: category || null,
        title: title.trim(),
        as_is: asIs || null,
        to_be: toBe || null,
        note: note || null,
        is_confidential: Boolean(isConfidential),
        status: '대기',
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ requirement: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
