import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess, requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_STATUSES } from '@/lib/projectStatuses';

export async function PATCH(request, { params }) {
  try {
    const { id, brandId } = await params;

    const body = await request.json();
    const { status } = body;
    if (!DEPLOY_STATUSES.includes(status)) {
      throw new ApiError(400, '유효하지 않은 전개 상태입니다.');
    }

    // "우리 브랜드에 적용 완료됐다"는 그 브랜드 팀이 가장 정확히 안다.
    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('project_brands')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('project_id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '전개 대상을 찾을 수 없습니다.');

    return Response.json({ projectBrand: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id, brandId } = await params;
    await requireGlobalAdmin();

    const supabase = getSupabaseAdmin();

    // 연결된 요구사항이 남아 있으면 제거를 막는다. 먼저 연결을 해제하도록 유도한다.
    const { count, error: countError } = await supabase
      .from('requirements')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id)
      .eq('brand_id', brandId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new ApiError(
        400,
        `이 브랜드에 연결된 요구사항이 ${count}건 남아 있습니다. 먼저 연결을 해제하세요.`,
      );
    }

    const { data, error } = await supabase
      .from('project_brands')
      .delete()
      .eq('project_id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '전개 대상을 찾을 수 없습니다.');

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
