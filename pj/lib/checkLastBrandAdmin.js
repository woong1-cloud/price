export function checkLastBrandAdmin({ roles, targetMemberId, brandId }) {
  const targetRole = roles.find(
    (r) => r.brand_id === brandId && r.team_member_id === targetMemberId
  );
  if (!targetRole || targetRole.tier !== '2차') return false;

  const adminCount = roles.filter((r) => r.brand_id === brandId && r.tier === '2차').length;
  return adminCount <= 1;
}
