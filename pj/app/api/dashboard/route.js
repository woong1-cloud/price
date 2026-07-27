// app/api/dashboard/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeDashboardStats } from '@/lib/dashboardStats';

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
    return Response.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}
