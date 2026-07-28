// app/api/dashboard/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse } from '@/lib/apiError';
import { computeDashboardStats } from '@/lib/dashboardStats';
import { computeProjectProgress, findProgressMismatches } from '@/lib/projectProgress';
import { DEPLOY_PLANNED, DEPLOY_IN_PROGRESS, DEPLOY_DONE } from '@/lib/projectStatuses';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    await requireGlobalAdmin();

    const daysParam = searchParams.get('days');
    const periodDays = daysParam === '7' || daysParam === '30' ? Number(daysParam) : null;

    const supabase = getSupabaseAdmin();
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (brandsError) throw brandsError;

    let requirements = [];
    if (brands.length > 0) {
      const brandIds = brands.map((b) => b.id);
      const { data, error: reqError } = await supabase
        .from('requirements')
        .select('id, brand_id, status, request_date, completed_at')
        .in('brand_id', brandIds);
      if (reqError) throw reqError;
      requirements = data ?? [];
    }

    const today = new Date().toISOString().slice(0, 10);
    const stats = computeDashboardStats({ requirements, brands, periodDays, today });

    // ── 프로젝트 집계 ────────────────────────────────────────────────
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (projectsError) throw projectsError;

    const projectIds = (projects ?? []).map((p) => p.id);
    let projectBrands = [];
    let projectRequirements = [];
    if (projectIds.length > 0) {
      const [pbResult, reqResult] = await Promise.all([
        supabase.from('project_brands').select('project_id, brand_id, status').in('project_id', projectIds),
        supabase.from('requirements').select('project_id, brand_id, status').in('project_id', projectIds),
      ]);
      if (pbResult.error) throw pbResult.error;
      if (reqResult.error) throw reqResult.error;
      projectBrands = pbResult.data ?? [];
      projectRequirements = reqResult.data ?? [];
    }

    const projectsWithProgress = (projects ?? []).map((p) => {
      const progress = computeProjectProgress({
        requirements: projectRequirements.filter((r) => r.project_id === p.id),
        projectBrands: projectBrands.filter((pb) => pb.project_id === p.id),
        brands,
      });
      return {
        projectId: p.id,
        projectName: p.name,
        byBrand: progress.byBrand,
        overall: progress.overall,
      };
    });

    const deployCounts = {
      [DEPLOY_PLANNED]: 0,
      [DEPLOY_IN_PROGRESS]: 0,
      [DEPLOY_DONE]: 0,
    };
    for (const pb of projectBrands) {
      if (deployCounts[pb.status] !== undefined) deployCounts[pb.status] += 1;
    }

    const projectSummary = {
      activeProjectCount: projects?.length ?? 0,
      plannedBrandCount: deployCounts[DEPLOY_PLANNED],
      inProgressBrandCount: deployCounts[DEPLOY_IN_PROGRESS],
      doneBrandCount: deployCounts[DEPLOY_DONE],
    };

    const mismatches = findProgressMismatches(projectsWithProgress);

    return Response.json({
      ...stats,
      projectSummary,
      projects: projectsWithProgress,
      mismatches,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
