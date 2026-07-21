import { describe, expect, it } from 'vitest';
import { checkBrandAccess } from './checkBrandAccess';

describe('checkBrandAccess', () => {
  it('전역 관리자는 모든 브랜드에 접근 가능하다', () => {
    const result = checkBrandAccess({ isGlobalAdmin: true, roles: [], brandId: 'brand-1', minTier: '2차' });
    expect(result).toEqual({ allowed: true, tier: '1차' });
  });

  it('해당 브랜드에 역할이 없으면 거부한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-2', tier: '2차' }],
      brandId: 'brand-1',
      minTier: '3차',
    });
    expect(result).toEqual({ allowed: false, tier: null });
  });

  it('요구되는 tier보다 낮은 등급은 거부한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-1', tier: '3차' }],
      brandId: 'brand-1',
      minTier: '2차',
    });
    expect(result).toEqual({ allowed: false, tier: '3차' });
  });

  it('요구되는 tier 이상이면 허용한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-1', tier: '2차' }],
      brandId: 'brand-1',
      minTier: '3차',
    });
    expect(result).toEqual({ allowed: true, tier: '2차' });
  });
});
