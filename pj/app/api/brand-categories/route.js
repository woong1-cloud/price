import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
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
