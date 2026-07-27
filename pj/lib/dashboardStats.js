import { DONE_STATUS, MERGED_STATUS } from './statuses';

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dateOnly(isoTimestamp) {
  return isoTimestamp.slice(0, 10);
}

function daysBetween(dateStr, isoTimestamp) {
  const start = new Date(`${dateStr}T00:00:00Z`);
  const end = new Date(`${dateOnly(isoTimestamp)}T00:00:00Z`);
  return (end - start) / (1000 * 60 * 60 * 24);
}

export function computeDashboardStats({ requirements, brands, periodDays, today }) {
  const cutoff = periodDays == null ? null : addDays(today, -periodDays);

  const byBrand = brands.map((brand) => {
    const brandReqs = requirements.filter((r) => r.brand_id === brand.id);

    const openCount = brandReqs.filter((r) => r.status !== DONE_STATUS && r.status !== MERGED_STATUS).length;

    const newInPeriod = brandReqs.filter((r) => cutoff === null || r.request_date >= cutoff).length;

    const completedReqs = brandReqs.filter(
      (r) => r.status === DONE_STATUS && (cutoff === null || dateOnly(r.completed_at) >= cutoff)
    );
    const completedInPeriod = completedReqs.length;

    const avgCompletionDays =
      completedInPeriod === 0
        ? null
        : completedReqs.reduce((sum, r) => sum + daysBetween(r.request_date, r.completed_at), 0) /
          completedInPeriod;

    return {
      brandId: brand.id,
      brandName: brand.name,
      openCount,
      newInPeriod,
      completedInPeriod,
      avgCompletionDays,
    };
  });

  const overall = {
    brandCount: brands.length,
    openCount: byBrand.reduce((sum, b) => sum + b.openCount, 0),
    completedInPeriod: byBrand.reduce((sum, b) => sum + b.completedInPeriod, 0),
  };

  return { overall, byBrand };
}
