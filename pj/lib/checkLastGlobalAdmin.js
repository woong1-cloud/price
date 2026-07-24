export function checkLastGlobalAdmin({ teamMembers, targetMemberId }) {
  const target = teamMembers.find((m) => m.id === targetMemberId);
  if (!target || !target.is_global_admin || !target.is_active) return false;

  const activeAdminCount = teamMembers.filter((m) => m.is_global_admin && m.is_active).length;
  return activeAdminCount <= 1;
}
