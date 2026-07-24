export const TIER_RANK = { '4차': 1, '3차': 2, '2차': 3, '1차': 4 };

// 저장값(1차/2차/3차/4차)은 그대로 두고 화면 표시 문구만 사용자 친화적으로 바꾼다.
export const TIER_LABELS = {
  '1차': '전체 관리자',
  '2차': '브랜드 관리자',
  '3차': '실무자',
  '4차': '요청자',
};

// 요구사항 처리(상태변경/내용수정/담당자지정) 가능 여부. 1차/2차/3차.
export function canProcess(identity) {
  if (identity?.isGlobalAdmin === true) return true;
  return TIER_RANK[identity?.tier] >= TIER_RANK['3차'];
}

// 브랜드 운영 관리(팀원 배치/카테고리 관리) 가능 여부. 1차/2차.
export function canManageBrand(identity) {
  if (identity?.isGlobalAdmin === true) return true;
  return TIER_RANK[identity?.tier] >= TIER_RANK['2차'];
}

export function isGlobalAdmin(identity) {
  return identity?.isGlobalAdmin === true;
}
