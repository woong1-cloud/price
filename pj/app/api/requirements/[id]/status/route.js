import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { BOARD_STATUSES, MERGED_STATUS } from '@/lib/statuses';
import { computeCompletedAt } from '@/lib/completedAt';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, status } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (status === MERGED_STATUS) {
      throw new ApiError(400, "'중복'은 중복처리로만 설정할 수 있습니다.");
    }
    if (!BOARD_STATUSES.includes(status)) {
      throw new ApiError(400, '유효하지 않은 상태입니다.');
    }

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id, status, completed_at')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');
    if (current.status === MERGED_STATUS) {
      throw new ApiError(400, '병합된 요구사항의 상태는 변경할 수 없습니다.');
    }

    const nowIso = new Date().toISOString();
    const completedAt = computeCompletedAt(current.status, status, current.completed_at, nowIso);

    const { error: updError } = await supabase
      .from('requirements')
      .update({ status, completed_at: completedAt, updated_at: nowIso })
      .eq('id', id);
    if (updError) throw updError;

    const { error: logError } = await supabase.from('change_logs').insert({
      requirement_id: id,
      brand_id: brandId,
      changed_by: memberId,
      change_type: '상태변경',
      field_name: 'status',
      old_value: current.status,
      new_value: status,
    });
    if (logError) throw logError;

    return Response.json({ ok: true, status });
  } catch (error) {
    return errorResponse(error);
  }
}
