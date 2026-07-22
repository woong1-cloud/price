import { describe, expect, it } from 'vitest';
import { computeCompletedAt } from './completedAt';

const NOW = '2026-07-22T00:00:00.000Z';

describe('computeCompletedAt', () => {
  it('완료로 진입하면 nowIso로 설정한다', () => {
    expect(computeCompletedAt('진행중', '완료', null, NOW)).toBe(NOW);
  });

  it('완료에서 벗어나면 null로 초기화한다', () => {
    expect(computeCompletedAt('완료', '진행중', '2026-01-01T00:00:00.000Z', NOW)).toBe(null);
  });

  it('완료→완료(변화 없음)는 기존 값을 유지한다', () => {
    expect(computeCompletedAt('완료', '완료', '2026-01-01T00:00:00.000Z', NOW)).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('완료와 무관한 전이는 기존 값(null)을 유지한다', () => {
    expect(computeCompletedAt('대기', '진행중', null, NOW)).toBe(null);
  });
});
