import { describe, expect, it } from 'vitest';
import { checkLastBrandAdmin } from './checkLastBrandAdmin';

describe('checkLastBrandAdmin', () => {
  it('대상이 해당 브랜드의 유일한 2차이면 true', () => {
    const roles = [{ team_member_id: 'm1', brand_id: 'b1', tier: '2차' }];
    expect(checkLastBrandAdmin({ roles, targetMemberId: 'm1', brandId: 'b1' })).toBe(true);
  });

  it('같은 브랜드에 다른 2차가 더 있으면 false', () => {
    const roles = [
      { team_member_id: 'm1', brand_id: 'b1', tier: '2차' },
      { team_member_id: 'm2', brand_id: 'b1', tier: '2차' },
    ];
    expect(checkLastBrandAdmin({ roles, targetMemberId: 'm1', brandId: 'b1' })).toBe(false);
  });

  it('대상이 3차이면 애초에 보호 대상이 아니므로 false', () => {
    const roles = [{ team_member_id: 'm1', brand_id: 'b1', tier: '3차' }];
    expect(checkLastBrandAdmin({ roles, targetMemberId: 'm1', brandId: 'b1' })).toBe(false);
  });

  it('다른 브랜드의 2차는 카운트에 포함하지 않는다', () => {
    const roles = [
      { team_member_id: 'm1', brand_id: 'b1', tier: '2차' },
      { team_member_id: 'm2', brand_id: 'b2', tier: '2차' },
    ];
    expect(checkLastBrandAdmin({ roles, targetMemberId: 'm1', brandId: 'b1' })).toBe(true);
  });

  it('대상의 역할 자체가 없으면 false', () => {
    const roles = [{ team_member_id: 'm2', brand_id: 'b1', tier: '2차' }];
    expect(checkLastBrandAdmin({ roles, targetMemberId: 'm1', brandId: 'b1' })).toBe(false);
  });
});
