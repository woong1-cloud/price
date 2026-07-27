import { TIER_RANK } from './tiers';

export function checkBrandAccess({ isGlobalAdmin, roles, brandId, minTier }) {
  if (isGlobalAdmin) {
    return { allowed: true, tier: '1차' };
  }
  const role = roles.find((r) => r.brand_id === brandId);
  if (!role) {
    return { allowed: false, tier: null };
  }
  const rank = TIER_RANK[role.tier];
  if (rank === undefined) {
    return { allowed: false, tier: role.tier };
  }
  return { allowed: rank >= TIER_RANK[minTier], tier: role.tier };
}
