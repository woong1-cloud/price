import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_IN_PROGRESS } from '@/lib/projectStatuses';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;

    const body = await request.json();
    // projectId가 null이면 연결 해제.
    const projectId = body.projectId ?? null;
    if (body.projectId === undefined) throw new ApiError(400, 'projectId가 필요합니다.');

    const supabase = getSupabaseAdmin();

    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    // 담당자 지정·상태 변경과 같은 수준의 실무 작업이다.
    await requireBrandAccess(requirement.brand_id, '3차');

    if (projectId !== null) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, is_active')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');
      if (!project.is_active) throw new ApiError(400, '보관된 프로젝트에는 연결할 수 없습니다.');

      // 전개 대상에 없으면 '진행중'으로 자동 추가한다. 요구사항이 이미 있다는 것은
      // 그 브랜드에서 작업이 시작됐다는 뜻이므로 '전개예정'이 아니라 '진행중'이 맞다.
      // ignoreDuplicates로 기존 행의 상태(예: 적용완료)를 덮어쓰지 않는다.
      const { error: pbError } = await supabase
        .from('project_brands')
        .upsert(
          { project_id: projectId, brand_id: requirement.brand_id, status: DEPLOY_IN_PROGRESS },
          { onConflict: 'project_id,brand_id', ignoreDuplicates: true },
        );
      if (pbError) throw pbError;
    }

    const { error: updError } = await supabase
      .from('requirements')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updError) throw updError;

    return Response.json({ ok: true, projectId });
  } catch (error) {
    return errorResponse(error);
  }
}
