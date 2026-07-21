import { TIER_RANK } from './tiers';

export function checkBrandAccess({ isGlobalAdmin, roles, brandId, minTier }) {
  if (isGlobalAdmin) {
    return { allowed: true, tier: '1차' };
  }
  const role = roles.find((r) => r.brand_id === brandId);
  if (!role) {
    return { allowed: false, tier: null };
  }
  return { allowed: TIER_RANK[role.tier] >= TIER_RANK[minTier], tier: role.tier };
}
