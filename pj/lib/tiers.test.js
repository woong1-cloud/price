import { describe, expect, it } from 'vitest';
import { isGlobalAdmin } from './tiers';

describe('isGlobalAdmin', () => {
  it('isGlobalAdmin이 true인 identity는 true', () => {
    expect(isGlobalAdmin({ isGlobalAdmin: true })).toBe(true);
  });

  it('isGlobalAdmin이 false인 identity는 false', () => {
    expect(isGlobalAdmin({ isGlobalAdmin: false })).toBe(false);
  });

  it('identity가 없으면 false', () => {
    expect(isGlobalAdmin(undefined)).toBe(false);
  });

  it('isGlobalAdmin 필드가 없으면 false', () => {
    expect(isGlobalAdmin({ tier: '2차' })).toBe(false);
  });
});
