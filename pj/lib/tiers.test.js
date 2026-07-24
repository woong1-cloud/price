import { describe, expect, it } from 'vitest';
import { canManageBrand, canProcess, isGlobalAdmin } from './tiers';

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

describe('canProcess', () => {
  it('1차는 true', () => {
    expect(canProcess({ tier: '1차' })).toBe(true);
  });
  it('2차는 true', () => {
    expect(canProcess({ tier: '2차' })).toBe(true);
  });
  it('3차(실무자)는 true', () => {
    expect(canProcess({ tier: '3차' })).toBe(true);
  });
  it('4차(요청자)는 false', () => {
    expect(canProcess({ tier: '4차' })).toBe(false);
  });
  it('identity가 없으면 false', () => {
    expect(canProcess(undefined)).toBe(false);
  });
});

describe('canManageBrand', () => {
  it('1차는 true', () => {
    expect(canManageBrand({ tier: '1차' })).toBe(true);
  });
  it('2차는 true', () => {
    expect(canManageBrand({ tier: '2차' })).toBe(true);
  });
  it('3차(실무자)는 false', () => {
    expect(canManageBrand({ tier: '3차' })).toBe(false);
  });
  it('4차(요청자)는 false', () => {
    expect(canManageBrand({ tier: '4차' })).toBe(false);
  });
  it('identity가 없으면 false', () => {
    expect(canManageBrand(undefined)).toBe(false);
  });
});
