import { DONE_STATUS } from './statuses';

// 상태 전이에 따라 저장할 completed_at 값을 계산한다(순수 함수).
// - 완료로 진입: nowIso
// - 완료에서 이탈: null
// - 그 외: 기존 값 유지
export function computeCompletedAt(oldStatus, newStatus, prevCompletedAt, nowIso) {
  if (newStatus === DONE_STATUS && oldStatus !== DONE_STATUS) return nowIso;
  if (oldStatus === DONE_STATUS && newStatus !== DONE_STATUS) return null;
  return prevCompletedAt;
}
