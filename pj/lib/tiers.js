export const TIER_RANK = { '3차': 1, '2차': 2, '1차': 3 };

// 클라이언트 UI 게이팅용(보안 경계 아님). 2차 이상이면 처리 권한이 있다.
export function canManage(identity) {
  return identity?.tier === '1차' || identity?.tier === '2차';
}

export function isGlobalAdmin(identity) {
  return identity?.isGlobalAdmin === true;
}
