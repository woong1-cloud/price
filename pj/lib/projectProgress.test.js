import { describe, expect, it } from 'vitest';
import { computeProjectProgress } from './projectProgress';

const BRANDS = [
  { id: 'b1', name: '스파오' },
  { id: 'b2', name: '미쏘' },
  { id: 'b3', name: '로엠' },
];

describe('computeProjectProgress', () => {
  it('전개 대상이 없으면 빈 결과를 반환한다', () => {
    const result = computeProjectProgress({ requirements: [], projectBrands: [], brands: BRANDS });
    expect(result).toEqual({ byBrand: [], overall: { doneCount: 0, totalCount: 0 } });
  });

  it('요구사항이 0건인 브랜드도 전개 대상이면 결과에 포함된다', () => {
    const projectBrands = [{ brand_id: 'b3', status: '전개예정' }];
    const result = computeProjectProgress({ requirements: [], projectBrands, brands: BRANDS });
    expect(result.byBrand).toEqual([
      { brandId: 'b3', brandName: '로엠', status: '전개예정', doneCount: 0, totalCount: 0 },
    ]);
  });

  it('완료 건수를 분자로, 중복을 제외한 건수를 분모로 센다', () => {
    const projectBrands = [{ brand_id: 'b1', status: '적용완료' }];
    const requirements = [
      { id: '1', brand_id: 'b1', status: '완료' },
      { id: '2', brand_id: 'b1', status: '완료' },
      { id: '3', brand_id: 'b1', status: '진행중' },
      { id: '4', brand_id: 'b1', status: '중복' },
    ];
    const result = computeProjectProgress({ requirements, projectBrands, brands: BRANDS });
    expect(result.byBrand[0]).toEqual({
      brandId: 'b1',
      brandName: '스파오',
      status: '적용완료',
      doneCount: 2,
      totalCount: 3,
    });
  });

  it('전개 대상이 아닌 브랜드의 요구사항은 집계에 넣지 않는다', () => {
    const projectBrands = [{ brand_id: 'b1', status: '진행중' }];
    const requirements = [
      { id: '1', brand_id: 'b1', status: '완료' },
      { id: '2', brand_id: 'b2', status: '완료' },
    ];
    const result = computeProjectProgress({ requirements, projectBrands, brands: BRANDS });
    expect(result.byBrand).toHaveLength(1);
    expect(result.overall).toEqual({ doneCount: 1, totalCount: 1 });
  });

  it('overall은 브랜드별 비율의 평균이 아니라 건수의 합이다', () => {
    const projectBrands = [
      { brand_id: 'b1', status: '적용완료' },
      { brand_id: 'b2', status: '진행중' },
    ];
    const requirements = [
      // b1: 10건 중 10건 완료
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, brand_id: 'b1', status: '완료' })),
      // b2: 10건 중 0건 완료
      ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, brand_id: 'b2', status: '대기' })),
    ];
    const result = computeProjectProgress({ requirements, projectBrands, brands: BRANDS });
    // 비율 평균이면 (100% + 0%) / 2 = 50%. 건수 합이면 10/20 — 여기선 같지만
    // 아래 케이스에서 갈린다.
    expect(result.overall).toEqual({ doneCount: 10, totalCount: 20 });
  });

  it('건수가 크게 다른 브랜드가 섞여도 합산으로 계산한다', () => {
    const projectBrands = [
      { brand_id: 'b1', status: '적용완료' },
      { brand_id: 'b2', status: '진행중' },
    ];
    const requirements = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, brand_id: 'b1', status: '완료' })),
      { id: 'b0', brand_id: 'b2', status: '대기' },
    ];
    const result = computeProjectProgress({ requirements, projectBrands, brands: BRANDS });
    // 비율 평균이면 (100% + 0%)/2 = 50%. 합산이면 12/13 ≈ 92%.
    expect(result.overall).toEqual({ doneCount: 12, totalCount: 13 });
  });

  it('brands에 없는 브랜드 id는 이름을 알 수 없음으로 표시한다', () => {
    const projectBrands = [{ brand_id: 'unknown', status: '진행중' }];
    const result = computeProjectProgress({ requirements: [], projectBrands, brands: BRANDS });
    expect(result.byBrand[0].brandName).toBe('알 수 없음');
  });
});
