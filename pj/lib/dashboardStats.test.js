import { describe, expect, it } from 'vitest';
import { computeDashboardStats } from './dashboardStats';

const BRANDS = [
  { id: 'b1', name: '스파오' },
  { id: 'b2', name: '뉴발란스' },
];

describe('computeDashboardStats', () => {
  it('브랜드/요구사항이 없으면 빈 결과를 반환한다', () => {
    const result = computeDashboardStats({ requirements: [], brands: [], periodDays: 7, today: '2026-07-24' });
    expect(result).toEqual({
      overall: { brandCount: 0, openCount: 0, completedInPeriod: 0 },
      byBrand: [],
    });
  });

  it('브랜드는 있지만 요구사항이 없으면 전부 0/null이다', () => {
    const result = computeDashboardStats({ requirements: [], brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    expect(result.byBrand).toEqual([
      { brandId: 'b1', brandName: '스파오', openCount: 0, newInPeriod: 0, completedInPeriod: 0, avgCompletionDays: null },
      { brandId: 'b2', brandName: '뉴발란스', openCount: 0, newInPeriod: 0, completedInPeriod: 0, avgCompletionDays: null },
    ]);
  });

  it('미해결은 완료/중복을 제외하고 기간과 무관하게 집계한다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '대기', request_date: '2020-01-01', completed_at: null },
      { id: '2', brand_id: 'b1', status: '진행중', request_date: '2020-01-01', completed_at: null },
      { id: '3', brand_id: 'b1', status: '완료', request_date: '2020-01-01', completed_at: '2020-01-05T00:00:00Z' },
      { id: '4', brand_id: 'b1', status: '중복', request_date: '2020-01-01', completed_at: null },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.openCount).toBe(2);
  });

  it('신규는 request_date가 기준일(오늘-periodDays) 이후인 건만 센다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '대기', request_date: '2026-07-20', completed_at: null },
      { id: '2', brand_id: 'b1', status: '대기', request_date: '2026-07-01', completed_at: null },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.newInPeriod).toBe(1);
  });

  it('완료는 completed_at 날짜가 기준일 이후인 건만 센다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '완료', request_date: '2026-07-01', completed_at: '2026-07-20T03:00:00Z' },
      { id: '2', brand_id: 'b1', status: '완료', request_date: '2026-07-01', completed_at: '2026-07-01T03:00:00Z' },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.completedInPeriod).toBe(1);
  });

  it('평균 소요일을 올바르게 계산한다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '완료', request_date: '2026-07-18', completed_at: '2026-07-20T00:00:00Z' },
      { id: '2', brand_id: 'b1', status: '완료', request_date: '2026-07-16', completed_at: '2026-07-20T00:00:00Z' },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.avgCompletionDays).toBe(3);
  });

  it('기간 내 완료가 0건이면 평균 소요일은 null이다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '대기', request_date: '2026-07-20', completed_at: null },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.avgCompletionDays).toBeNull();
  });

  it('periodDays가 null(전체)이면 날짜와 무관하게 전부 포함한다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '완료', request_date: '2020-01-01', completed_at: '2020-01-05T00:00:00Z' },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: null, today: '2026-07-24' });
    const spao = result.byBrand.find((b) => b.brandId === 'b1');
    expect(spao.newInPeriod).toBe(1);
    expect(spao.completedInPeriod).toBe(1);
  });

  it('overall 합계는 byBrand 합의 합과 같다', () => {
    const requirements = [
      { id: '1', brand_id: 'b1', status: '대기', request_date: '2026-07-20', completed_at: null },
      { id: '2', brand_id: 'b2', status: '진행중', request_date: '2026-07-20', completed_at: null },
      { id: '3', brand_id: 'b1', status: '완료', request_date: '2026-07-18', completed_at: '2026-07-20T00:00:00Z' },
    ];
    const result = computeDashboardStats({ requirements, brands: BRANDS, periodDays: 7, today: '2026-07-24' });
    expect(result.overall).toEqual({ brandCount: 2, openCount: 2, completedInPeriod: 1 });
  });
});
