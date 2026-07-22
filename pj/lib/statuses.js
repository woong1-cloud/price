// 요구사항 상태 단일 출처. '중복'은 병합 전용(직접 전환 불가).
export const REQUIREMENT_STATUSES = ['대기', '요청', '검토', '정책정의', '진행중', '완료', '중복'];

// 보드 컬럼(중복 제외, 왼쪽→오른쪽 순서).
export const BOARD_STATUSES = ['대기', '요청', '검토', '정책정의', '진행중', '완료'];

export const MERGED_STATUS = '중복';
export const DONE_STATUS = '완료';
