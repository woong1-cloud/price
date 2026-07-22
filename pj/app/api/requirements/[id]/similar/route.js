import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { MERGED_STATUS } from '@/lib/statuses';
import { trigramSimilarity } from '@/lib/similarity';

const SIMILARITY_THRESHOLD = 0.2;
const MAX_CANDIDATES = 5;

function combinedText(row) {
  return [row.title, row.as_is, row.to_be].filter(Boolean).join(' ');
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: self, error: selfError } = await supabase
      .from('requirements')
      .select('id, brand_id, title, as_is, to_be')
      .eq('id', id)
      .maybeSingle();
    if (selfError) throw selfError;
    if (!self) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (self.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    const { data: others, error: othersError } = await supabase
      .from('requirements')
      .select('id, title, as_is, to_be, status, requester:team_members!requirements_requester_fkey(name)')
      .eq('brand_id', brandId)
      .neq('id', id)
      .neq('status', MERGED_STATUS);
    if (othersError) throw othersError;

    const selfText = combinedText(self);
    const candidates = (others ?? [])
      .map((row) => ({
        id: row.id,
        title: row.title,
        requester_name: row.requester?.name ?? null,
        status: row.status,
        score: trigramSimilarity(selfText, combinedText(row)),
      }))
      .filter((c) => c.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    return Response.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}
