import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_PLANNED } from '@/lib/projectStatuses';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await requireGlobalAdmin();

    const body = await request.json();
    const { brandId } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const supabase = getSupabaseAdmin();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand) throw new ApiError(404, '브랜드를 찾을 수 없습니다.');

    // 관리자가 명시적으로 추가하는 경우이므로 '전개예정'에서 시작한다.
    // (요구사항 연결로 자동 추가될 때는 '진행중' — 그쪽은 이미 작업이 있다는 뜻)
    const { data, error } = await supabase
      .from('project_brands')
      .insert({ project_id: id, brand_id: brandId, status: DEPLOY_PLANNED })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 전개 대상에 포함된 브랜드입니다.');
      throw error;
    }

    return Response.json({ projectBrand: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
