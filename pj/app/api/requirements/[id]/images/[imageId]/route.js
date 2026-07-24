import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { removeImageObject } from '@/lib/storage';

export async function DELETE(request, { params }) {
  try {
    const { id, imageId } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '4차');

    const supabase = getSupabaseAdmin();
    const { data: image, error: imgError } = await supabase
      .from('requirement_images')
      .select('id, requirement_id, brand_id, storage_path')
      .eq('id', imageId)
      .maybeSingle();
    if (imgError) throw imgError;
    if (!image || image.requirement_id !== id) {
      throw new ApiError(404, '이미지를 찾을 수 없습니다.');
    }
    if (image.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    await removeImageObject(image.storage_path);
    const { error: delError } = await supabase
      .from('requirement_images')
      .delete()
      .eq('id', imageId);
    if (delError) throw delError;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
