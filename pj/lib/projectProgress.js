import { DONE_STATUS, MERGED_STATUS } from './statuses';
import { DEPLOY_DONE } from './projectStatuses';

// 프로젝트 하나의 브랜드별/전체 진척률을 계산한다.
// 분모에서 '중복' 요구사항을 빼는 것은 lib/dashboardStats.js와 같은 규칙이다
// (병합되어 사라진 항목이므로 세지 않는다).
export function computeProjectProgress({ requirements, projectBrands, brands }) {
  const nameById = new Map(brands.map((b) => [b.id, b.name]));

  const byBrand = projectBrands.map((pb) => {
    const counted = requirements.filter(
      (r) => r.brand_id === pb.brand_id && r.status !== MERGED_STATUS,
    );
    return {
      brandId: pb.brand_id,
      brandName: nameById.get(pb.brand_id) ?? '알 수 없음',
      status: pb.status,
      doneCount: counted.filter((r) => r.status === DONE_STATUS).length,
      totalCount: counted.length,
    };
  });

  // 브랜드별 비율의 평균이 아니라 건수의 합이다. 요구사항 12건인 브랜드와
  // 1건인 브랜드를 동등하게 취급하면 전체 진척이 왜곡된다.
  const overall = {
    doneCount: byBrand.reduce((sum, b) => sum + b.doneCount, 0),
    totalCount: byBrand.reduce((sum, b) => sum + b.totalCount, 0),
  };

  return { byBrand, overall };
}

// 전개 상태가 '적용완료'인데 미완료 요구사항이 남은 조합을 찾는다.
// 데이터 오류가 아니라 사람이 확인해야 할 상황이다 — 오픈 후 후속 작업이
// 남았거나, 상태를 성급히 바꿨거나, 요구사항 상태 갱신이 누락된 경우다.
//
// projectsWithProgress: [{ projectId, projectName, byBrand: computeProjectProgress의 byBrand }]
export function findProgressMismatches(projectsWithProgress) {
  const result = [];
  for (const project of projectsWithProgress) {
    for (const brand of project.byBrand) {
      if (brand.status !== DEPLOY_DONE) continue;
      const remainingCount = brand.totalCount - brand.doneCount;
      if (remainingCount <= 0) continue;
      result.push({
        projectId: project.projectId,
        projectName: project.projectName,
        brandId: brand.brandId,
        brandName: brand.brandName,
        remainingCount,
      });
    }
  }
  return result;
}
