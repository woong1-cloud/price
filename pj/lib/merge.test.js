import { describe, expect, it } from 'vitest';
import { validateMerge } from './merge';

const base = {
  sourceId: 'a',
  targetId: 'b',
  sourceStatus: '대기',
  targetStatus: '진행중',
  sameBrand: true,
};

describe('validateMerge', () => {
  it('정상 케이스는 ok', () => {
    expect(validateMerge(base)).toEqual({ ok: true });
  });

  it('대상 미선택은 거부', () => {
    expect(validateMerge({ ...base, targetId: null }).ok).toBe(false);
  });

  it('자기 자신에 병합은 거부', () => {
    expect(validateMerge({ ...base, targetId: 'a' }).ok).toBe(false);
  });

  it('다른 브랜드는 거부', () => {
    expect(validateMerge({ ...base, sameBrand: false }).ok).toBe(false);
  });

  it('이미 중복인 소스는 거부', () => {
    expect(validateMerge({ ...base, sourceStatus: '중복' }).ok).toBe(false);
  });

  it('중복 상태의 대상은 거부', () => {
    expect(validateMerge({ ...base, targetStatus: '중복' }).ok).toBe(false);
  });
});
