import { describe, expect, it } from 'vitest';
import { checkLastGlobalAdmin } from './checkLastGlobalAdmin';

describe('checkLastGlobalAdmin', () => {
  it('유일한 활성 전체관리자이면 true', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: true, is_active: true }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(true);
  });

  it('다른 활성 전체관리자가 더 있으면 false', () => {
    const teamMembers = [
      { id: 'm1', is_global_admin: true, is_active: true },
      { id: 'm2', is_global_admin: true, is_active: true },
    ];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('대상이 애초에 전체관리자가 아니면 false', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: false, is_active: true }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('대상이 이미 비활성 상태면 false(보호 대상 아님)', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: true, is_active: false }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('다른 전체관리자가 있어도 비활성이면 카운트에서 제외되어 true', () => {
    const teamMembers = [
      { id: 'm1', is_global_admin: true, is_active: true },
      { id: 'm2', is_global_admin: true, is_active: false },
    ];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(true);
  });

  it('대상이 목록에 없으면 false', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: true, is_active: true }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm2' })).toBe(false);
  });
});
