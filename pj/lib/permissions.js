import { getSupabaseAdmin } from './supabaseAdmin';
import { checkBrandAccess } from './checkBrandAccess';
import { ApiError } from './apiError';
import { getSessionMember } from './auth';

export async function requireBrandAccess(brandId, minTier) {
  if (!brandId) {
    throw new ApiError(400, 'brandId가 필요합니다.');
  }

  const { memberId, isGlobalAdmin } = await getSessionMember();

  const supabase = getSupabaseAdmin();
  const { data: roles, error: rolesError } = await supabase
    .from('user_brand_roles')
    .select('brand_id, tier')
    .eq('team_member_id', memberId);

  if (rolesError) {
    console.error(rolesError);
    throw new ApiError(500, '권한 조회 중 오류가 발생했습니다.');
  }

  const result = checkBrandAccess({
    isGlobalAdmin,
    roles: roles ?? [],
    brandId,
    minTier,
  });

  if (!result.allowed) {
    throw new ApiError(403, '해당 브랜드에 대한 권한이 없습니다.');
  }

  return { memberId, isGlobalAdmin, tier: result.tier };
}

export async function requireGlobalAdmin() {
  const { memberId, isGlobalAdmin } = await getSessionMember();
  if (!isGlobalAdmin) {
    throw new ApiError(403, '전역 관리자 권한이 필요합니다.');
  }
  return { memberId, isGlobalAdmin: true };
}
