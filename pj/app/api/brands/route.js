// app/api/brands/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brands')
      .select('id, name, code, workflow_template, is_active')
      .order('name');
    if (error) throw error;
    return Response.json({ brands: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, name, code, workflowTemplate, adminMemberId } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');
    if (!name || !name.trim()) throw new ApiError(400, '이름은 필수입니다.');
    if (!code || !code.trim()) throw new ApiError(400, '코드는 필수입니다.');
    if (!adminMemberId) throw new ApiError(400, '초기 2차 관리자를 선택해주세요.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('create_brand_with_admin', {
      p_name: name.trim(),
      p_code: code.trim(),
      p_workflow_template: workflowTemplate || '표준',
      p_admin_member_id: adminMemberId,
      p_created_by: memberId,
    });
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 사용 중인 브랜드 코드입니다.');
      throw error;
    }
    return Response.json({ brandId: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
