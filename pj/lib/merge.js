import { MERGED_STATUS } from './statuses';

// 중복 병합 유효성(순수 함수). ok:false면 error 메시지를 함께 반환.
export function validateMerge({ sourceId, targetId, sourceStatus, targetStatus, sameBrand }) {
  if (!targetId) return { ok: false, error: '병합 대상을 선택하세요.' };
  if (sourceId === targetId) return { ok: false, error: '자기 자신에는 병합할 수 없습니다.' };
  if (!sameBrand) return { ok: false, error: '다른 브랜드의 요구사항과는 병합할 수 없습니다.' };
  if (sourceStatus === MERGED_STATUS) return { ok: false, error: '이미 중복 처리된 요구사항입니다.' };
  if (targetStatus === MERGED_STATUS) {
    return { ok: false, error: '중복 처리된 요구사항을 대상으로 병합할 수 없습니다.' };
  }
  return { ok: true };
}
