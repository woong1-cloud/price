import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeProjectProgress } from '@/lib/projectProgress';

export async function GET(request) {
  try {
    // 3차 실무자도 요구사항을 연결하려면 프로젝트를 봐야 하므로 로그인만 요구한다.
    await getSessionMember();

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const supabase = getSupabaseAdmin();

    let projectQuery = supabase
      .from('projects')
      .select(
        'id, name, description, is_active, created_at, ' +
          'owner:team_members!projects_owner_fkey(id, name)',
      )
      .order('created_at', { ascending: false });
    if (!includeInactive) projectQuery = projectQuery.eq('is_active', true);

    const { data: projects, error: projectsError } = await projectQuery;
    if (projectsError) throw projectsError;

    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) return Response.json({ projects: [] });

    const [pbResult, brandsResult, reqResult] = await Promise.all([
      supabase.from('project_brands').select('project_id, brand_id, status').in('project_id', projectIds),
      supabase.from('brands').select('id, name'),
      supabase.from('requirements').select('project_id, brand_id, status').in('project_id', projectIds),
    ]);
    if (pbResult.error) throw pbResult.error;
    if (brandsResult.error) throw brandsResult.error;
    if (reqResult.error) throw reqResult.error;

    const allProjectBrands = pbResult.data ?? [];
    const brands = brandsResult.data ?? [];
    const allRequirements = reqResult.data ?? [];

    let result = projects.map((project) => {
      const progress = computeProjectProgress({
        requirements: allRequirements.filter((r) => r.project_id === project.id),
        projectBrands: allProjectBrands.filter((pb) => pb.project_id === project.id),
        brands,
      });
      return { ...project, byBrand: progress.byBrand, overall: progress.overall };
    });

    // brandId가 오면 그 브랜드에 전개된 프로젝트만 남긴다(목록 화면의 "내 브랜드" 기본값).
    if (brandId) {
      result = result.filter((p) => p.byBrand.some((b) => b.brandId === brandId));
    }

    return Response.json({ projects: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { memberId } = await requireGlobalAdmin();

    const body = await request.json();
    const { name, description, owner } = body;
    if (!name || !name.trim()) throw new ApiError(400, '프로젝트 이름은 필수입니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        owner: owner || null,
        created_by: memberId,
      })
      .select()
      .single();
    if (error) throw error;

    return Response.json({ project: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
