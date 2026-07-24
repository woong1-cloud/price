export const TIER_RANK = { '3차': 1, '2차': 2, '1차': 3 };

// 저장값(1차/2차/3차)은 그대로 두고 화면 표시 문구만 사용자 친화적으로 바꾼다.
export const TIER_LABELS = { '1차': '전체 관리자', '2차': '브랜드 관리자', '3차': '구성원' };

// 클라이언트 UI 게이팅용(보안 경계 아님). 2차 이상이면 처리 권한이 있다.
export function canManage(identity) {
  return identity?.tier === '1차' || identity?.tier === '2차';
}

export function isGlobalAdmin(identity) {
  return identity?.isGlobalAdmin === true;
}
