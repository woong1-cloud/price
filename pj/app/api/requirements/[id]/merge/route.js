import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { validateMerge } from '@/lib/merge';

export async function POST(request, { params }) {
  try {
    const { id } = await params; // source(중복이 될 건)
    const body = await request.json();
    const { memberId, brandId, targetId } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data: rows, error: fetchError } = await supabase
      .from('requirements')
      .select('id, brand_id, status')
      .in('id', [id, targetId].filter(Boolean));
    if (fetchError) throw fetchError;

    const source = (rows ?? []).find((r) => r.id === id);
    const target = (rows ?? []).find((r) => r.id === targetId);
    if (!source) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (source.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');
    if (!target) throw new ApiError(404, '병합 대상을 찾을 수 없습니다.');

    const check = validateMerge({
      sourceId: id,
      targetId,
      sourceStatus: source.status,
      targetStatus: target.status,
      sameBrand: source.brand_id === target.brand_id,
    });
    if (!check.ok) throw new ApiError(400, check.error);

    const { error: rpcError } = await supabase.rpc('merge_requirement', {
      p_source: id,
      p_target: targetId,
      p_member: memberId,
    });
    if (rpcError) throw rpcError;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
