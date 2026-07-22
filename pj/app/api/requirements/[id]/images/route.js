import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { validateImageUpload } from '@/lib/imageUpload';
import { uploadImage, toSignedImageList } from '@/lib/storage';

async function loadImageList(supabase, requirementId) {
  const { data, error } = await supabase
    .from('requirement_images')
    .select('id, storage_path, content_type, sort_order')
    .eq('requirement_id', requirementId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const memberId = form.get('memberId');
    const brandId = form.get('brandId');
    const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size !== undefined);
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (files.length === 0) throw new ApiError(400, '업로드할 이미지가 없습니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    let existing = await loadImageList(supabase, id);
    let nextSort = existing.length;

    for (const file of files) {
      const check = validateImageUpload({
        contentType: file.type,
        byteSize: file.size,
        currentCount: existing.length,
      });
      if (!check.ok) throw new ApiError(400, check.error);

      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadImage({
        brandId,
        requirementId: id,
        buffer,
        contentType: file.type,
      });
      const { error: insError } = await supabase.from('requirement_images').insert({
        requirement_id: id,
        brand_id: brandId,
        storage_path: path,
        content_type: file.type,
        byte_size: file.size,
        sort_order: nextSort,
        uploaded_by: memberId,
      });
      if (insError) throw insError;
      nextSort += 1;
      existing = await loadImageList(supabase, id);
    }

    const images = await toSignedImageList(existing);
    return Response.json({ images }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
