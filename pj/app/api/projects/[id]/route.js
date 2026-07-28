import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeProjectProgress } from '@/lib/projectProgress';
import { TIER_RANK } from '@/lib/tiers';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { memberId, isGlobalAdmin } = await getSessionMember();

    const supabase = getSupabaseAdmin();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, name, description, is_active, created_at, ' +
          'owner:team_members!projects_owner_fkey(id, name)',
      )
      .eq('id', id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    const [pbResult, brandsResult, reqResult, rolesResult] = await Promise.all([
      supabase.from('project_brands').select('brand_id, status').eq('project_id', id),
      supabase.from('brands').select('id, name'),
      supabase
        .from('requirements')
        .select(
          'id, brand_id, priority, urgency, request_date, status, title, is_confidential, ' +
            'duplicate_count, ' +
            'assignee:team_members!requirements_assignee_fkey(id, name), ' +
            'category:brand_categories(id, category_name), ' +
            'requirement_images(count)',
        )
        .eq('project_id', id)
        .order('request_date', { ascending: false }),
      supabase.from('user_brand_roles').select('brand_id, tier').eq('team_member_id', memberId),
    ]);
    if (pbResult.error) throw pbResult.error;
    if (brandsResult.error) throw brandsResult.error;
    if (reqResult.error) throw reqResult.error;
    if (rolesResult.error) throw rolesResult.error;

    const projectBrands = pbResult.data ?? [];
    const brands = brandsResult.data ?? [];

    // 비공개 요구사항은 전체관리자이거나 그 브랜드에 3차 이상일 때만 보인다.
    const tierByBrand = new Map((rolesResult.data ?? []).map((r) => [r.brand_id, r.tier]));
    const canSeeConfidential = (brandIdOfReq) => {
      if (isGlobalAdmin) return true;
      const tier = tierByBrand.get(brandIdOfReq);
      return Boolean(tier) && TIER_RANK[tier] >= TIER_RANK['3차'];
    };

    const requirements = (reqResult.data ?? [])
      .filter((r) => !r.is_confidential || canSeeConfidential(r.brand_id))
      .map((row) => {
        const { requirement_images, ...rest } = row;
        return { ...rest, image_count: requirement_images?.[0]?.count ?? 0 };
      });

    // 진척률은 열람 권한과 무관하게 전체 요구사항 기준으로 계산한다.
    // 비공개 건이 필터링됐다고 분모가 줄면 사람마다 다른 진척률을 보게 된다.
    const progress = computeProjectProgress({
      requirements: reqResult.data ?? [],
      projectBrands,
      brands,
    });

    return Response.json({
      project,
      byBrand: progress.byBrand,
      overall: progress.overall,
      requirements,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    await requireGlobalAdmin();

    const body = await request.json();
    const patch = {};
    if (body.name !== undefined) {
      if (!body.name || !body.name.trim()) throw new ApiError(400, '프로젝트 이름은 필수입니다.');
      patch.name = body.name.trim();
    }
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.owner !== undefined) patch.owner = body.owner || null;
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (Object.keys(patch).length === 0) throw new ApiError(400, '변경할 내용이 없습니다.');
    patch.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    return Response.json({ project: data });
  } catch (error) {
    return errorResponse(error);
  }
}
