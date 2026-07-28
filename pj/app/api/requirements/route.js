import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { TIER_RANK } from '@/lib/tiers';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const project = searchParams.get('project');

    const { tier, isGlobalAdmin } = await requireBrandAccess(brandId, '4차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('requirements')
      .select(
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, ' +
          'project_id, project:projects(id, name), ' +
          'requester:team_members!requirements_requester_fkey(id, name), ' +
          'assignee:team_members!requirements_assignee_fkey(id, name), ' +
          'category:brand_categories(id, category_name), ' +
          'requirement_images(count)'
      )
      .eq('brand_id', brandId)
      .order('request_date', { ascending: false });

    if (!canSeeConfidential) query = query.eq('is_confidential', false);
    if (status) query = query.eq('status', status);
    if (assignee) query = query.eq('assignee', assignee);
    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);
    if (project) query = query.eq('project_id', project);

    const { data, error } = await query;
    if (error) throw error;

    const requirements = (data ?? []).map((row) => {
      const { requirement_images, ...rest } = row;
      return { ...rest, image_count: requirement_images?.[0]?.count ?? 0 };
    });
    return Response.json({ requirements });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      brandId,
      priority,
      urgency,
      requestDate,
      category,
      title,
      asIs,
      toBe,
      note,
      isConfidential,
    } = body;

    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (!title || !title.trim()) throw new ApiError(400, '제목은 필수입니다.');

    const { memberId, isGlobalAdmin, tier } = await requireBrandAccess(brandId, '4차');
    const canSetConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requirements')
      .insert({
        brand_id: brandId,
        priority: priority || null,
        urgency: urgency || null,
        request_date: requestDate || new Date().toISOString().slice(0, 10),
        requester: memberId,
        category: category || null,
        title: title.trim(),
        as_is: asIs || null,
        to_be: toBe || null,
        note: note || null,
        is_confidential: canSetConfidential ? Boolean(isConfidential) : false,
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
