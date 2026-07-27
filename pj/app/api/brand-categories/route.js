// app/api/brand-categories/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brand_categories')
      .select('id, category_name, sort_order')
      .eq('brand_id', brandId)
      .order('sort_order');
    if (error) throw error;
    return Response.json({ categories: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { brandId, categoryName } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (!categoryName || !categoryName.trim()) throw new ApiError(400, '카테고리 이름은 필수입니다.');

    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: last, error: lastError } = await supabase
      .from('brand_categories')
      .select('sort_order')
      .eq('brand_id', brandId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    const nextSortOrder = (last?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('brand_categories')
      .insert({ brand_id: brandId, category_name: categoryName.trim(), sort_order: nextSortOrder })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ category: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
