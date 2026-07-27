// app/api/brand-categories/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { brandId, categoryName, sortOrder } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');

    const updates = {};
    if (categoryName !== undefined) {
      if (!categoryName.trim()) throw new ApiError(400, '카테고리 이름은 필수입니다.');
      updates.category_name = categoryName.trim();
    }
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brand_categories')
      .update(updates)
      .eq('id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '카테고리를 찾을 수 없습니다.');
    return Response.json({ category: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { count, error: usageError } = await supabase
      .from('requirements')
      .select('id', { count: 'exact', head: true })
      .eq('category', id);
    if (usageError) throw usageError;
    if ((count ?? 0) > 0) {
      throw new ApiError(400, '이 카테고리를 사용 중인 요구사항이 있어 삭제할 수 없습니다.');
    }

    const { error } = await supabase
      .from('brand_categories')
      .delete()
      .eq('id', id)
      .eq('brand_id', brandId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
