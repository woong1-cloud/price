import { getSupabaseAdmin } from './supabaseAdmin';
import { checkBrandAccess } from './checkBrandAccess';
import { ApiError } from './apiError';

export async function requireBrandAccess(memberId, brandId, minTier) {
  if (!memberId || !brandId) {
    throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
  }

  const supabase = getSupabaseAdmin();

  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('id', memberId)
    .single();

  if (memberError) {
    console.error(memberError);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active) {
    throw new ApiError(403, '유효하지 않은 사용자입니다.');
  }

  const { data: roles, error: rolesError } = await supabase
    .from('user_brand_roles')
    .select('brand_id, tier')
    .eq('team_member_id', memberId);

  if (rolesError) {
    console.error(rolesError);
    throw new ApiError(500, '권한 조회 중 오류가 발생했습니다.');
  }

  const result = checkBrandAccess({
    isGlobalAdmin: member.is_global_admin,
    roles: roles ?? [],
    brandId,
    minTier,
  });

  if (!result.allowed) {
    throw new ApiError(403, '해당 브랜드에 대한 권한이 없습니다.');
  }

  return { isGlobalAdmin: member.is_global_admin, tier: result.tier };
}

export async function requireGlobalAdmin(memberId) {
  if (!memberId) {
    throw new ApiError(400, 'memberId가 필요합니다.');
  }

  const supabase = getSupabaseAdmin();
  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('id', memberId)
    .single();

  if (error) {
    console.error(error);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active || !member.is_global_admin) {
    throw new ApiError(403, '전역 관리자 권한이 필요합니다.');
  }

  return { isGlobalAdmin: true };
}
