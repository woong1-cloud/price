import { describe, expect, it } from 'vitest';
import { trigramSimilarity } from './similarity';

describe('trigramSimilarity', () => {
  it('동일 문자열은 1', () => {
    expect(trigramSimilarity('결제 버튼 색상', '결제 버튼 색상')).toBe(1);
  });
  it('완전히 다른 문자열은 낮다', () => {
    expect(trigramSimilarity('결제 버튼', '배송 지연 문의')).toBeLessThan(0.2);
  });
  it('유사한 문자열은 임계값 이상', () => {
    expect(trigramSimilarity('결제 페이지 버튼 색상 변경', '결제 페이지 버튼 색 변경')).toBeGreaterThan(0.2);
  });
  it('빈 문자열은 0', () => {
    expect(trigramSimilarity('', '결제')).toBe(0);
  });
});
