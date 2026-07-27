// app/api/brands/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, code, workflowTemplate, isActive } = body;

    await requireGlobalAdmin();

    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, '이름은 필수입니다.');
      updates.name = name.trim();
    }
    if (code !== undefined) {
      if (!code.trim()) throw new ApiError(400, '코드는 필수입니다.');
      updates.code = code.trim();
    }
    if (workflowTemplate !== undefined) updates.workflow_template = workflowTemplate;
    if (isActive !== undefined) updates.is_active = isActive;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brands')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 사용 중인 브랜드 코드입니다.');
      throw error;
    }
    if (!data) throw new ApiError(404, '브랜드를 찾을 수 없습니다.');
    return Response.json({ brand: data });
  } catch (error) {
    return errorResponse(error);
  }
}
