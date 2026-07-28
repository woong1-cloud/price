# 프로젝트 관리 + 대시보드 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요구사항보다 상위 단위인 "프로젝트"를 도입해, 하나의 기능이 어느 브랜드까지 전개됐고 각 브랜드에서 얼마나 진행됐는지를 관리한다.

**Architecture:** 프로젝트는 브랜드에 속하지 않는 전사 단위(`projects`)이고, 브랜드로의 전개는 상태를 가진 연결 테이블(`project_brands`)로 표현한다. 요구사항은 최대 1개 프로젝트에 연결된다(`requirements.project_id`). 전개 상태는 사람이 지정하고 진척률은 요구사항에서 자동 계산하는 하이브리드 방식이다.

**Tech Stack:** Next.js 16(App Router, JS) + React 19 + Tailwind v4 + shadcn/ui + Supabase(Postgres) + Vitest + @dnd-kit

**참고 스펙:** `docs/superpowers/specs/2026-07-28-multibrand-requirements-projects-design.md`

**작업 위치:** 모든 파일 경로는 `pj/` 기준 상대 경로다.

> **필독 — 이 저장소의 함정:** ESLint 설정에 import 경로 검사 규칙이 없다. 잘못된 import 경로는 `npm run lint`를 통과하고 `npm run build`에서만 드러난다. **import를 추가하는 태스크는 반드시 `npm run build`까지 돌린다.**

---

## 파일 구조

**신규 생성**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0006_projects.sql` | `projects`/`project_brands` 테이블, `requirements.project_id` |
| `lib/projectStatuses.js` | 전개 상태 상수 단일 출처 |
| `lib/projectProgress.js` | `computeProjectProgress()`, `findProgressMismatches()` 순수 함수 |
| `lib/projectProgress.test.js` | 위 두 함수의 테스트 |
| `app/api/projects/route.js` | GET 목록 / POST 생성 |
| `app/api/projects/[id]/route.js` | GET 상세 / PATCH 수정 |
| `app/api/projects/[id]/brands/route.js` | POST 전개 대상 브랜드 추가 |
| `app/api/projects/[id]/brands/[brandId]/route.js` | PATCH 상태 변경 / DELETE 전개 대상 제거 |
| `app/api/requirements/[id]/project/route.js` | PATCH 프로젝트 연결·해제 |
| `app/projects/layout.js` | IdentityProvider + TopBar 레이아웃 |
| `app/projects/page.js` | 프로젝트 목록 |
| `app/projects/[id]/page.js` | 프로젝트 상세(전개 현황 + 통합 칸반) |
| `components/ProjectFormDialog.jsx` | 프로젝트 생성/수정 다이얼로그 |
| `components/ProjectBrandsSection.jsx` | 전개 현황 카드 |

**수정**

| 파일 | 변경 내용 |
|---|---|
| `app/api/requirements/route.js` | GET에 `project` 필터 + `project` 조인, POST에 `projectId` 처리 |
| `app/api/dashboard/route.js` | 프로젝트 집계 추가 |
| `components/KanbanBoard.jsx` | 자체 fetch 제거 → prop 기반 프레젠테이셔널 컴포넌트로 전환 |
| `components/RequirementCard.jsx` | 브랜드 배지, 드래그 잠금 지원 |
| `app/requirements/board/page.js` | 요구사항 상태를 페이지가 소유하도록 변경 |
| `components/RequirementFormDialog.jsx` | 프로젝트 선택 드롭다운 |
| `components/RequirementDetail.jsx` | 프로젝트 배지 + 연결/해제 |
| `components/FilterBar.jsx` | 프로젝트 필터 |
| `app/requirements/page.js` | 프로젝트 목록 로드 + 필터 연결 |
| `components/TopBar.jsx` | `프로젝트` 링크 |
| `app/admin/dashboard/page.js` | 프로젝트 섹션 |

---

## Task 1: 마이그레이션 0006 — projects / project_brands / requirements.project_id

**Files:**
- Create: `supabase/migrations/0006_projects.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다. (0001~0005 실행 이후)

-- 프로젝트: 브랜드에 속하지 않는 전사 단위
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner uuid references team_members(id),
  is_active boolean not null default true,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 전개 현황: 어느 브랜드에 어디까지 갔는지
create table project_brands (
  id uuid primary key default gen_random_uuid(),
  -- 프로젝트가 사라지면 전개 현황은 의미가 없으므로 cascade.
  -- (아래 requirements.project_id는 반대로 set null — 요구사항은 남아야 한다)
  project_id uuid not null references projects(id) on delete cascade,
  brand_id uuid not null references brands(id),
  status text not null default '전개예정'
    check (status in ('전개예정','진행중','적용완료')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, brand_id)
);

-- 요구사항 → 프로젝트 (1:N, 선택사항)
-- 프로젝트를 지워도 요구사항 자체는 유효한 업무 기록이므로 남긴다.
alter table requirements
  add column project_id uuid references projects(id) on delete set null;

-- project_id 단독 조회는 위 unique (project_id, brand_id) 제약이 만드는 인덱스가
-- 이미 커버한다(선행 컬럼). 브랜드 단독 조회만 별도 인덱스가 필요하다.
create index idx_project_brands_brand on project_brands (brand_id);

-- project_id 단독 조회와 (project_id, brand_id) 조합 조회를 한 인덱스로 커버한다.
-- 후자는 전개 대상 제거 시 "이 브랜드에 남은 요구사항이 있는가" 검사에 쓰인다.
create index idx_requirements_project_brand on requirements (project_id, brand_id);
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

이 프로젝트에는 자동 마이그레이션 러너가 없다. 위 내용을 Supabase SQL Editor에 붙여넣어 직접 실행한다. 실행 후 Table Editor에서 `projects`, `project_brands` 테이블이 생겼는지, `requirements`에 `project_id` 컬럼이 추가됐는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0006_projects.sql
git commit -m "$(cat <<'EOF'
feat: projects/project_brands 테이블 + requirements.project_id 추가
EOF
)"
```

---

## Task 2: 전개 상태 상수 (`lib/projectStatuses.js`)

기존 `lib/statuses.js`가 요구사항 상태의 단일 출처인 것과 같은 방식으로, 전개 상태도 한 곳에서 관리한다. 마이그레이션의 CHECK 제약과 값이 정확히 일치해야 한다.

**Files:**
- Create: `lib/projectStatuses.js`

- [ ] **Step 1: 파일 작성**

```js
// 브랜드별 전개 상태 단일 출처. 0006_projects.sql의 CHECK 제약과 값이 일치해야 한다.
export const DEPLOY_STATUSES = ['전개예정', '진행중', '적용완료'];

export const DEPLOY_PLANNED = '전개예정';
export const DEPLOY_IN_PROGRESS = '진행중';
export const DEPLOY_DONE = '적용완료';
```

- [ ] **Step 2: 커밋**

```bash
git add lib/projectStatuses.js
git commit -m "$(cat <<'EOF'
feat: 브랜드별 전개 상태 상수 추가
EOF
)"
```

---

## Task 3: `computeProjectProgress()` (TDD)

**Files:**
- Create: `lib/projectProgress.js`
- Create: `lib/projectProgress.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/projectProgress.test.js`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- --run lib/projectProgress.test.js`
Expected: FAIL — `Failed to resolve import "./projectProgress"`

- [ ] **Step 3: 최소 구현 작성**

`lib/projectProgress.js`:

```js
import { DONE_STATUS, MERGED_STATUS } from './statuses';

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- --run lib/projectProgress.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/projectProgress.js lib/projectProgress.test.js
git commit -m "$(cat <<'EOF'
feat: computeProjectProgress 순수 함수 추가

중복 요구사항은 분모에서 제외하고, 전체 진척은 브랜드별 비율의
평균이 아니라 건수의 합으로 계산한다.
EOF
)"
```

---

## Task 4: `findProgressMismatches()` (TDD)

전개 상태가 `적용완료`인데 미완료 요구사항이 남은 (프로젝트, 브랜드) 조합을 찾는다. 대시보드의 "확인 필요" 목록에 쓴다.

**Files:**
- Modify: `lib/projectProgress.js` (함수 추가)
- Modify: `lib/projectProgress.test.js` (describe 블록 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/projectProgress.test.js` 파일 맨 아래에 다음을 덧붙인다. 상단 import도 함께 고친다:

```js
import { computeProjectProgress, findProgressMismatches } from './projectProgress';
```

```js
describe('findProgressMismatches', () => {
  it('불일치가 없으면 빈 배열을 반환한다', () => {
    const input = [
      {
        projectId: 'p1',
        projectName: '빠른배송 시스템 개발',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '적용완료', doneCount: 5, totalCount: 5 },
        ],
      },
    ];
    expect(findProgressMismatches(input)).toEqual([]);
  });

  it('적용완료인데 미완료가 남은 조합을 찾아낸다', () => {
    const input = [
      {
        projectId: 'p1',
        projectName: '빠른배송 시스템 개발',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '적용완료', doneCount: 10, totalCount: 12 },
        ],
      },
    ];
    expect(findProgressMismatches(input)).toEqual([
      {
        projectId: 'p1',
        projectName: '빠른배송 시스템 개발',
        brandId: 'b1',
        brandName: '스파오',
        remainingCount: 2,
      },
    ]);
  });

  it('적용완료가 아닌 상태는 미완료가 남아도 불일치가 아니다', () => {
    const input = [
      {
        projectId: 'p1',
        projectName: '빠른배송 시스템 개발',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '진행중', doneCount: 1, totalCount: 5 },
          { brandId: 'b2', brandName: '미쏘', status: '전개예정', doneCount: 0, totalCount: 0 },
        ],
      },
    ];
    expect(findProgressMismatches(input)).toEqual([]);
  });

  it('요구사항이 0건인데 적용완료면 불일치가 아니다', () => {
    const input = [
      {
        projectId: 'p1',
        projectName: '빠른배송 시스템 개발',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '적용완료', doneCount: 0, totalCount: 0 },
        ],
      },
    ];
    expect(findProgressMismatches(input)).toEqual([]);
  });

  it('여러 프로젝트·브랜드에 걸친 불일치를 모두 모은다', () => {
    const input = [
      {
        projectId: 'p1',
        projectName: '빠른배송',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '적용완료', doneCount: 1, totalCount: 3 },
          { brandId: 'b2', brandName: '미쏘', status: '적용완료', doneCount: 2, totalCount: 2 },
        ],
      },
      {
        projectId: 'p2',
        projectName: '통합 회원',
        byBrand: [
          { brandId: 'b1', brandName: '스파오', status: '적용완료', doneCount: 0, totalCount: 1 },
        ],
      },
    ];
    expect(findProgressMismatches(input)).toEqual([
      { projectId: 'p1', projectName: '빠른배송', brandId: 'b1', brandName: '스파오', remainingCount: 2 },
      { projectId: 'p2', projectName: '통합 회원', brandId: 'b1', brandName: '스파오', remainingCount: 1 },
    ]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- --run lib/projectProgress.test.js`
Expected: FAIL — `findProgressMismatches is not a function`

- [ ] **Step 3: 최소 구현 추가**

`lib/projectProgress.js` 맨 아래에 덧붙인다. 상단 import도 함께 고친다:

```js
import { DONE_STATUS, MERGED_STATUS } from './statuses';
import { DEPLOY_DONE } from './projectStatuses';
```

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- --run lib/projectProgress.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm test -- --run`
Expected: PASS (73 tests) — 기존 60개 + 신규 13개

- [ ] **Step 6: 커밋**

```bash
git add lib/projectProgress.js lib/projectProgress.test.js
git commit -m "$(cat <<'EOF'
feat: findProgressMismatches 순수 함수 추가

적용완료로 표시됐는데 미완료 요구사항이 남은 (프로젝트, 브랜드)
조합을 찾아 대시보드에서 확인을 유도한다.
EOF
)"
```

---

## Task 5: API `GET/POST /api/projects`

목록은 각 프로젝트의 전개 현황과 진척률까지 한 번에 돌려준다. 목록 화면이 프로젝트마다 추가 요청을 보내지 않도록 하기 위함이다.

**Files:**
- Create: `app/api/projects/route.js`

- [ ] **Step 1: 라우트 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeProjectProgress } from '@/lib/projectProgress';

export async function GET(request) {
  try {
    // 3차 실무자도 요구사항을 연결하려면 프로젝트를 봐야 하므로 로그인만 요구한다.
    await getSessionMember();

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const supabase = getSupabaseAdmin();

    let projectQuery = supabase
      .from('projects')
      .select(
        'id, name, description, is_active, created_at, ' +
          'owner:team_members!projects_owner_fkey(id, name)',
      )
      .order('created_at', { ascending: false });
    if (!includeInactive) projectQuery = projectQuery.eq('is_active', true);

    const { data: projects, error: projectsError } = await projectQuery;
    if (projectsError) throw projectsError;

    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) return Response.json({ projects: [] });

    const [pbResult, brandsResult, reqResult] = await Promise.all([
      supabase.from('project_brands').select('project_id, brand_id, status').in('project_id', projectIds),
      supabase.from('brands').select('id, name'),
      supabase.from('requirements').select('project_id, brand_id, status').in('project_id', projectIds),
    ]);
    if (pbResult.error) throw pbResult.error;
    if (brandsResult.error) throw brandsResult.error;
    if (reqResult.error) throw reqResult.error;

    const allProjectBrands = pbResult.data ?? [];
    const brands = brandsResult.data ?? [];
    const allRequirements = reqResult.data ?? [];

    let result = projects.map((project) => {
      const progress = computeProjectProgress({
        requirements: allRequirements.filter((r) => r.project_id === project.id),
        projectBrands: allProjectBrands.filter((pb) => pb.project_id === project.id),
        brands,
      });
      return { ...project, byBrand: progress.byBrand, overall: progress.overall };
    });

    // brandId가 오면 그 브랜드에 전개된 프로젝트만 남긴다(목록 화면의 "내 브랜드" 기본값).
    if (brandId) {
      result = result.filter((p) => p.byBrand.some((b) => b.brandId === brandId));
    }

    return Response.json({ projects: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { memberId } = await requireGlobalAdmin();

    const body = await request.json();
    const { name, description, owner } = body;
    if (!name || !name.trim()) throw new ApiError(400, '프로젝트 이름은 필수입니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        owner: owner || null,
        created_by: memberId,
      })
      .select()
      .single();
    if (error) throw error;

    return Response.json({ project: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공. 라우트 목록에 `/api/projects`가 나타난다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/projects/route.js
git commit -m "feat: GET/POST /api/projects 추가"
```

---

## Task 6: API `GET/PATCH /api/projects/[id]`

상세는 전 브랜드 요구사항을 함께 돌려준다. 비공개 요구사항은 전체관리자이거나 해당 브랜드에 3차 이상 권한이 있을 때만 포함한다 — 프로젝트 화면이 브랜드 경계를 넘는다고 해서 비공개 정책까지 넘으면 안 된다.

**Files:**
- Create: `app/api/projects/[id]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeProjectProgress } from '@/lib/projectProgress';
import { TIER_RANK } from '@/lib/tiers';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { memberId, isGlobalAdmin } = await getSessionMember();

    const supabase = getSupabaseAdmin();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, name, description, is_active, created_at, ' +
          'owner:team_members!projects_owner_fkey(id, name)',
      )
      .eq('id', id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    const [pbResult, brandsResult, reqResult, rolesResult] = await Promise.all([
      supabase.from('project_brands').select('brand_id, status').eq('project_id', id),
      supabase.from('brands').select('id, name'),
      supabase
        .from('requirements')
        .select(
          'id, brand_id, priority, urgency, request_date, status, title, is_confidential, ' +
            'duplicate_count, ' +
            'assignee:team_members!requirements_assignee_fkey(id, name), ' +
            'category:brand_categories(id, category_name), ' +
            'requirement_images(count)',
        )
        .eq('project_id', id)
        .order('request_date', { ascending: false }),
      supabase.from('user_brand_roles').select('brand_id, tier').eq('team_member_id', memberId),
    ]);
    if (pbResult.error) throw pbResult.error;
    if (brandsResult.error) throw brandsResult.error;
    if (reqResult.error) throw reqResult.error;
    if (rolesResult.error) throw rolesResult.error;

    const projectBrands = pbResult.data ?? [];
    const brands = brandsResult.data ?? [];

    // 비공개 요구사항은 전체관리자이거나 그 브랜드에 3차 이상일 때만 보인다.
    const tierByBrand = new Map((rolesResult.data ?? []).map((r) => [r.brand_id, r.tier]));
    const canSeeConfidential = (brandIdOfReq) => {
      if (isGlobalAdmin) return true;
      const tier = tierByBrand.get(brandIdOfReq);
      return Boolean(tier) && TIER_RANK[tier] >= TIER_RANK['3차'];
    };

    const requirements = (reqResult.data ?? [])
      .filter((r) => !r.is_confidential || canSeeConfidential(r.brand_id))
      .map((row) => {
        const { requirement_images, ...rest } = row;
        return { ...rest, image_count: requirement_images?.[0]?.count ?? 0 };
      });

    // 진척률은 열람 권한과 무관하게 전체 요구사항 기준으로 계산한다.
    // 비공개 건이 필터링됐다고 분모가 줄면 사람마다 다른 진척률을 보게 된다.
    const progress = computeProjectProgress({
      requirements: reqResult.data ?? [],
      projectBrands,
      brands,
    });

    return Response.json({
      project,
      byBrand: progress.byBrand,
      overall: progress.overall,
      requirements,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    await requireGlobalAdmin();

    const body = await request.json();
    const patch = {};
    if (body.name !== undefined) {
      if (!body.name || !body.name.trim()) throw new ApiError(400, '프로젝트 이름은 필수입니다.');
      patch.name = body.name.trim();
    }
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.owner !== undefined) patch.owner = body.owner || null;
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (Object.keys(patch).length === 0) throw new ApiError(400, '변경할 내용이 없습니다.');
    patch.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    return Response.json({ project: data });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공. 라우트 목록에 `/api/projects/[id]`가 나타난다.

- [ ] **Step 3: 커밋**

```bash
git add "app/api/projects/[id]/route.js"
git commit -m "feat: GET/PATCH /api/projects/[id] 추가"
```

---

## Task 7: API `POST /api/projects/[id]/brands`

**Files:**
- Create: `app/api/projects/[id]/brands/route.js`

- [ ] **Step 1: 라우트 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_PLANNED } from '@/lib/projectStatuses';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await requireGlobalAdmin();

    const body = await request.json();
    const { brandId } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const supabase = getSupabaseAdmin();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .maybeSingle();
    if (brandError) throw brandError;
    if (!brand) throw new ApiError(404, '브랜드를 찾을 수 없습니다.');

    // 관리자가 명시적으로 추가하는 경우이므로 '전개예정'에서 시작한다.
    // (요구사항 연결로 자동 추가될 때는 '진행중' — 그쪽은 이미 작업이 있다는 뜻)
    const { data, error } = await supabase
      .from('project_brands')
      .insert({ project_id: id, brand_id: brandId, status: DEPLOY_PLANNED })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 전개 대상에 포함된 브랜드입니다.');
      throw error;
    }

    return Response.json({ projectBrand: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 커밋**

```bash
git add "app/api/projects/[id]/brands/route.js"
git commit -m "feat: POST /api/projects/[id]/brands 추가 (전개 대상 브랜드 추가)"
```

---

## Task 8: API `PATCH/DELETE /api/projects/[id]/brands/[brandId]`

상태 변경은 해당 브랜드 2차 이상, 전개 대상 제거는 1차다. 제거는 그 브랜드에 연결된 요구사항이 남아 있으면 거절한다 — 그대로 두면 "프로젝트에 속한 요구사항인데 전개 현황에는 없는" 유령 상태가 생긴다.

**Files:**
- Create: `app/api/projects/[id]/brands/[brandId]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess, requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_STATUSES } from '@/lib/projectStatuses';

export async function PATCH(request, { params }) {
  try {
    const { id, brandId } = await params;

    const body = await request.json();
    const { status } = body;
    if (!DEPLOY_STATUSES.includes(status)) {
      throw new ApiError(400, '유효하지 않은 전개 상태입니다.');
    }

    // "우리 브랜드에 적용 완료됐다"는 그 브랜드 팀이 가장 정확히 안다.
    await requireBrandAccess(brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('project_brands')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('project_id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '전개 대상을 찾을 수 없습니다.');

    return Response.json({ projectBrand: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id, brandId } = await params;
    await requireGlobalAdmin();

    const supabase = getSupabaseAdmin();

    // 연결된 요구사항이 남아 있으면 제거를 막는다. 먼저 연결을 해제하도록 유도한다.
    const { count, error: countError } = await supabase
      .from('requirements')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id)
      .eq('brand_id', brandId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new ApiError(
        400,
        `이 브랜드에 연결된 요구사항이 ${count}건 남아 있습니다. 먼저 연결을 해제하세요.`,
      );
    }

    const { data, error } = await supabase
      .from('project_brands')
      .delete()
      .eq('project_id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '전개 대상을 찾을 수 없습니다.');

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 커밋**

```bash
git add "app/api/projects/[id]/brands/[brandId]/route.js"
git commit -m "feat: 전개 상태 변경/전개 대상 제거 API 추가"
```

---

## Task 9: API `PATCH /api/requirements/[id]/project`

연결 시 그 요구사항의 브랜드가 전개 대상에 없으면 `진행중`으로 자동 추가한다. **쓰기 순서는 `project_brands` 추가 → `requirements.project_id` 설정**이다. 반대로 하면 전개 현황에 없는 요구사항이 잠시라도 존재하게 된다.

**Files:**
- Create: `app/api/requirements/[id]/project/route.js`

- [ ] **Step 1: 라우트 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { DEPLOY_IN_PROGRESS } from '@/lib/projectStatuses';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;

    const body = await request.json();
    // projectId가 null이면 연결 해제.
    const projectId = body.projectId ?? null;
    if (body.projectId === undefined) throw new ApiError(400, 'projectId가 필요합니다.');

    const supabase = getSupabaseAdmin();

    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    // 담당자 지정·상태 변경과 같은 수준의 실무 작업이다.
    await requireBrandAccess(requirement.brand_id, '3차');

    if (projectId !== null) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, is_active')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) throw new ApiError(404, '프로젝트를 찾을 수 없습니다.');
      if (!project.is_active) throw new ApiError(400, '보관된 프로젝트에는 연결할 수 없습니다.');

      // 전개 대상에 없으면 '진행중'으로 자동 추가한다. 요구사항이 이미 있다는 것은
      // 그 브랜드에서 작업이 시작됐다는 뜻이므로 '전개예정'이 아니라 '진행중'이 맞다.
      // ignoreDuplicates로 기존 행의 상태(예: 적용완료)를 덮어쓰지 않는다.
      const { error: pbError } = await supabase
        .from('project_brands')
        .upsert(
          { project_id: projectId, brand_id: requirement.brand_id, status: DEPLOY_IN_PROGRESS },
          { onConflict: 'project_id,brand_id', ignoreDuplicates: true },
        );
      if (pbError) throw pbError;
    }

    const { error: updError } = await supabase
      .from('requirements')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updError) throw updError;

    return Response.json({ ok: true, projectId });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 커밋**

```bash
git add "app/api/requirements/[id]/project/route.js"
git commit -m "feat: 요구사항-프로젝트 연결/해제 API 추가

연결 시 전개 대상에 없는 브랜드는 진행중으로 자동 추가한다.
전개 현황에 없는 요구사항이 생기지 않도록 project_brands를 먼저 쓴다."
```

---

## Task 10: 요구사항 목록 API에 프로젝트 필터·조인 추가

목록 화면의 프로젝트 필터와, 등록 시 프로젝트를 함께 지정하는 경로를 지원한다.

**Files:**
- Modify: `app/api/requirements/route.js`

- [ ] **Step 1: GET에 프로젝트 필터와 조인 추가**

`app/api/requirements/route.js`의 GET에서 세 곳을 고친다.

1) 쿼리 파라미터 읽기 — `const priority = searchParams.get('priority');` 아래에 추가:

```js
    const project = searchParams.get('project');
```

2) `.select(...)` 문자열에 `project_id`와 조인을 추가한다. 기존:

```js
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, ' +
          'requester:team_members!requirements_requester_fkey(id, name), ' +
```

를 다음으로 바꾼다:

```js
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, ' +
          'project_id, project:projects(id, name), ' +
          'requester:team_members!requirements_requester_fkey(id, name), ' +
```

3) 필터 적용 — `if (priority) query = query.eq('priority', priority);` 아래에 추가:

```js
    if (project) query = query.eq('project_id', project);
```

- [ ] **Step 2: POST는 건드리지 않는다 (의도적)**

`app/api/requirements/route.js`의 POST에는 `projectId`를 추가하지 **않는다.** 그대로 둔다.

이유: 프로젝트 연결에는 4절의 자동 브랜드 추가 규칙이 따라붙어야 하는데, 그 로직은 `PATCH /api/requirements/[id]/project` 한 곳에만 둔다. POST에서도 연결을 허용하면 같은 규칙을 두 곳에 복제해야 하고, 한쪽만 고치는 순간 전개 현황에 없는 요구사항이 생긴다.

등록 폼은 "등록(POST) → 프로젝트가 선택돼 있으면 연결(PATCH)" 두 단계로 처리한다(Task 17 참조).

- [ ] **Step 3: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 4: 커밋**

```bash
git add app/api/requirements/route.js
git commit -m "feat: 요구사항 목록 API에 프로젝트 필터/조인 추가"
```

---

## Task 11: `KanbanBoard`를 prop 기반 프레젠테이셔널 컴포넌트로 전환

지금 `KanbanBoard`는 `identity.brandId`로 직접 fetch한다. 프로젝트 상세에서는 전 브랜드 요구사항을 올려야 하므로, 데이터 소유를 부모로 올린다. 보드는 "받은 배열을 컬럼으로 나눠 그리고, 드롭되면 알려주는" 역할만 한다.

**Files:**
- Modify: `components/KanbanBoard.jsx`
- Modify: `app/requirements/board/page.js`

- [ ] **Step 1: `KanbanBoard`를 prop 기반으로 교체**

`components/KanbanBoard.jsx` 전체를 다음으로 바꾼다:

```jsx
'use client';

import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { BOARD_STATUSES } from '@/lib/statuses';
import { RequirementCard } from '@/components/RequirementCard';

function Column({ status, items, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="min-w-[180px] flex-shrink-0">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-sm font-medium text-slate-700">{status}</span>
        <span className="text-xs text-slate-400">{items.length}</span>
        {status === '대기' && (
          <span className="ml-auto rounded border border-indigo-200 px-1.5 text-[11px] text-indigo-600">
            Triage
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-col gap-2 rounded-lg p-1.5 ${
          isOver ? 'bg-indigo-50' : 'bg-slate-100/50'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// 데이터는 부모가 소유한다. 이 컴포넌트는 받은 배열을 컬럼으로 나눠 그리고
// 드롭 이벤트를 위로 올려보내기만 한다(브랜드 보드/프로젝트 보드 공용).
//
// props:
//   requirements      화면에 뿌릴 요구사항 배열
//   onStatusChange    (req, newStatus) => void — 낙관적 갱신/롤백은 부모 책임
//   onMerge           (req) => void — 카드의 중복처리 버튼
//   canDragCard       (req) => boolean — 카드 단위 드래그 허용 여부
//   showBrandBadge    카드에 브랜드명 배지를 표시할지(프로젝트 보드에서 true)
export function KanbanBoard({
  requirements,
  onStatusChange,
  onMerge,
  canDragCard = () => true,
  showBrandBadge = false,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(BOARD_STATUSES.map((s) => [s, []]));
    for (const r of requirements) {
      if (map[r.status]) map[r.status].push(r);
    }
    // 대기는 오래된 것 먼저, 나머지는 최신 먼저
    for (const s of BOARD_STATUSES) {
      map[s].sort((a, b) =>
        s === '대기'
          ? a.request_date.localeCompare(b.request_date)
          : b.request_date.localeCompare(a.request_date),
      );
    }
    return map;
  }, [requirements]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id;
    const card = requirements.find((r) => r.id === active.id);
    if (!card || card.status === newStatus || !BOARD_STATUSES.includes(newStatus)) return;
    if (!canDragCard(card)) return;
    onStatusChange(card, newStatus);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_STATUSES.map((status) => (
          <Column key={status} status={status} items={byStatus[status]}>
            {byStatus[status].map((req) => (
              <RequirementCard
                key={req.id}
                req={req}
                onMerge={onMerge}
                draggable={canDragCard(req)}
                showBrandBadge={showBrandBadge}
              />
            ))}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: 브랜드 보드 페이지가 데이터를 소유하도록 교체**

`app/requirements/board/page.js` 전체를 다음으로 바꾼다:

```jsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canProcess } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';
import { MergeDialog } from '@/components/MergeDialog';

export default function BoardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const processAllowed = canProcess(identity);

  const [reqs, setReqs] = useState([]);
  const [error, setError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);

  useEffect(() => {
    if (!processAllowed) router.replace('/requirements');
  }, [processAllowed, router]);

  const load = useCallback(() => {
    fetch(`/api/requirements?brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setReqs(d.requirements ?? []);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [identity.brandId]);

  useEffect(() => {
    if (!processAllowed) return;
    load();
  }, [processAllowed, load]);

  async function handleStatusChange(card, newStatus) {
    const prevStatus = card.status;
    setReqs((prev) => prev.map((r) => (r.id === card.id ? { ...r, status: newStatus } : r)));

    const res = await fetch(`/api/requirements/${card.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: card.brand_id ?? identity.brandId, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '상태 변경 실패');
      setReqs((prev) => prev.map((r) => (r.id === card.id ? { ...r, status: prevStatus } : r)));
    }
  }

  if (!processAllowed) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">요구사항 보드</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <KanbanBoard requirements={reqs} onStatusChange={handleStatusChange} onMerge={setMergeSource} />
      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            load();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 4: 커밋**

```bash
git add components/KanbanBoard.jsx app/requirements/board/page.js
git commit -m "refactor: KanbanBoard를 prop 기반 프레젠테이셔널 컴포넌트로 전환

프로젝트 상세에서 전 브랜드 요구사항을 한 보드에 올리기 위해
데이터 소유를 부모 페이지로 옮겼다. 브랜드 보드의 동작은 그대로다."
```

---

## Task 12: `RequirementCard` — 브랜드 배지 + 드래그 잠금

프로젝트 보드는 카드마다 브랜드가 다르다. 권한이 없는 브랜드의 카드는 드래그를 막고 시각적으로 구분한다.

**Files:**
- Modify: `components/RequirementCard.jsx`

- [ ] **Step 1: 컴포넌트 교체**

`components/RequirementCard.jsx` 전체를 다음으로 바꾼다:

```jsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';

const PRIORITY_STYLE = {
  상: 'bg-rose-50 text-rose-600',
  중: 'bg-amber-50 text-amber-700',
  하: 'bg-slate-100 text-slate-500',
};

// props:
//   req             요구사항
//   onMerge         (req) => void
//   draggable       false면 드래그 핸들을 잠근다(권한 없는 브랜드의 카드)
//   showBrandBadge  카드에 브랜드명 배지를 표시(프로젝트 보드처럼 여러 브랜드가 섞일 때)
export function RequirementCard({ req, onMerge, draggable = true, showBrandBadge = false }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: req.id,
    disabled: !draggable,
  });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        req.status === '완료' ? 'opacity-75' : ''
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {showBrandBadge && req.brand_name && (
          <span className="rounded bg-slate-900/85 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {req.brand_name}
          </span>
        )}
        {req.priority && PRIORITY_STYLE[req.priority] && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLE[req.priority]}`}>
            {req.priority}
          </span>
        )}
        {req.duplicate_count > 0 && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">
            중복 {req.duplicate_count}
          </span>
        )}
        {req.image_count > 0 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            📎 {req.image_count}
          </span>
        )}
        {req.is_confidential && (
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600">비공개</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push(`/requirements/${req.id}`)}
        className="block text-left text-[13px] text-slate-900 hover:underline"
      >
        {req.title}
      </button>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{req.category?.category_name ?? '-'}</span>
        <div className="flex items-center gap-1.5">
          {draggable && (
            <button
              type="button"
              onClick={() => onMerge(req)}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              중복처리
            </button>
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
            {req.assignee?.name ? req.assignee.name.slice(0, 2) : '미'}
          </span>
        </div>
      </div>

      {draggable ? (
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="mt-2 w-full cursor-grab rounded bg-slate-50 py-1 text-[11px] text-slate-400"
          aria-label="드래그해서 상태 변경"
        >
          ⋮⋮ 이동
        </button>
      ) : (
        <p className="mt-2 w-full rounded bg-slate-50 py-1 text-center text-[11px] text-slate-300">
          권한 없음
        </p>
      )}
    </div>
  );
}
```

> `showBrandBadge`가 켜져도 `req.brand_name`이 없으면 배지를 그리지 않는다. 브랜드 보드에서는 이 필드가 없으므로 자연히 꺼진다. 프로젝트 상세 페이지가 `brand_name`을 채워 넣는다(Task 16).

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 브랜드 보드 회귀 확인**

기존 `/requirements/board`가 그대로 동작하는지는 Task 20의 브라우저 검증에서 확인한다. 이 시점에는 build 통과로 충분하다.

- [ ] **Step 4: 커밋**

```bash
git add components/RequirementCard.jsx
git commit -m "feat: RequirementCard에 브랜드 배지와 드래그 잠금 추가"
```

---

## Task 13: `ProjectFormDialog` 컴포넌트

생성/수정 겸용 다이얼로그. `project` prop이 있으면 수정 모드다. 기존 `AccountCredentialDialog`의 `wasOpen` 렌더 시점 초기화 패턴을 따른다(`useEffect`로 폼을 리셋하지 않는다).

**Files:**
- Create: `components/ProjectFormDialog.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// props: open, onOpenChange, project(수정 대상 또는 null), teamMembers[], onSaved()
export function ProjectFormDialog({ open, onOpenChange, project, teamMembers, onSaved }) {
  const mode = project ? 'edit' : 'create';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 다이얼로그가 열리는 렌더에서 폼을 대상 값으로 맞춘다(useEffect 대신 파생 상태).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(project?.name ?? '');
      setDescription(project?.description ?? '');
      setOwner(project?.owner?.id ?? 'none');
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url = mode === 'create' ? '/api/projects' : `/api/projects/${project.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          owner: owner === 'none' ? null : owner,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '저장에 실패했습니다.');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const ownerItems = [
    { value: 'none', label: '지정 안 함' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '새 프로젝트' : '프로젝트 수정'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-name">프로젝트 이름</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-description">설명</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-owner">총괄 담당자</Label>
            <Select items={ownerItems} value={owner} onValueChange={setOwner}>
              <SelectTrigger id="project-owner" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ownerItems.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 커밋**

```bash
git add components/ProjectFormDialog.jsx
git commit -m "feat: ProjectFormDialog 컴포넌트 추가 (생성/수정 겸용)"
```

---

## Task 14: `ProjectBrandsSection` 컴포넌트 — 전개 현황 카드

브랜드별 전개 상태 배지와 진척바를 그린다. 상태 변경은 권한이 있는 브랜드에만 열어준다.

**Files:**
- Create: `components/ProjectBrandsSection.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEPLOY_STATUSES, DEPLOY_DONE } from '@/lib/projectStatuses';

const STATUS_STYLE = {
  전개예정: 'bg-slate-100 text-slate-500',
  진행중: 'bg-amber-50 text-amber-700',
  적용완료: 'bg-emerald-50 text-emerald-600',
};

function ProgressBar({ doneCount, totalCount, status }) {
  if (totalCount === 0) {
    // 0/0을 0%로 그리면 "시작했는데 진도가 없는 것"처럼 오해된다.
    return <span className="flex-1 text-[11px] text-slate-300">—</span>;
  }
  const pct = Math.round((doneCount / totalCount) * 100);
  return (
    <div className="flex flex-1 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-200">
        <div
          className={`h-full ${status === DEPLOY_DONE ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-[11px] text-slate-500">
        {doneCount}/{totalCount}건
      </span>
    </div>
  );
}

// props:
//   byBrand[]        computeProjectProgress의 byBrand
//   canEditStatus    (brandId) => boolean — 해당 브랜드 2차 이상인지
//   canManageBrands  전체관리자인지 (전개 대상 추가/제거 버튼)
//   availableBrands  아직 전개 대상이 아닌 브랜드 [{id, name}]
//   onChangeStatus   (brandId, status) => Promise
//   onAddBrand       (brandId) => Promise
//   onRemoveBrand    (brandId) => Promise
export function ProjectBrandsSection({
  byBrand,
  canEditStatus,
  canManageBrands,
  availableBrands,
  onChangeStatus,
  onAddBrand,
  onRemoveBrand,
}) {
  const [adding, setAdding] = useState('');

  const doneBrandCount = byBrand.filter((b) => b.status === DEPLOY_DONE).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-sm font-medium text-slate-700">전개 현황</h2>
        <span className="text-xs text-slate-500">
          {byBrand.length}개 브랜드 · {doneBrandCount}개 적용완료
        </span>
      </div>

      {byBrand.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">아직 전개 대상 브랜드가 없습니다.</p>
      ) : (
        <ul>
          {byBrand.map((b) => (
            <li
              key={b.brandId}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
            >
              <span className="w-20 flex-shrink-0 text-sm font-medium text-slate-900">
                {b.brandName}
              </span>

              {canEditStatus(b.brandId) ? (
                <Select
                  items={DEPLOY_STATUSES.map((s) => ({ value: s, label: s }))}
                  value={b.status}
                  onValueChange={(v) => onChangeStatus(b.brandId, v)}
                >
                  <SelectTrigger className="h-7 w-28 flex-shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPLOY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={`w-28 flex-shrink-0 rounded px-2 py-0.5 text-center text-xs font-medium ${
                    STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {b.status}
                </span>
              )}

              <ProgressBar doneCount={b.doneCount} totalCount={b.totalCount} status={b.status} />

              {canManageBrands && (
                <button
                  type="button"
                  onClick={() => onRemoveBrand(b.brandId)}
                  className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600 hover:underline"
                >
                  제거
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManageBrands && availableBrands.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-2.5">
          <Select
            items={availableBrands.map((b) => ({ value: b.id, label: b.name }))}
            value={adding || null}
            onValueChange={setAdding}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="브랜드 선택" />
            </SelectTrigger>
            <SelectContent>
              {availableBrands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={!adding}
            onClick={async () => {
              await onAddBrand(adding);
              setAdding('');
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            + 전개 브랜드 추가
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공. 미사용 변수 경고가 없어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add components/ProjectBrandsSection.jsx
git commit -m "feat: ProjectBrandsSection 컴포넌트 추가 (전개 현황 카드)"
```

---

## Task 15: `/projects` 목록 페이지 + 레이아웃

기본값은 **내 브랜드 중심**이다. 앱의 다른 화면이 전부 브랜드 컨텍스트라 여기만 전사로 열리면 "왜 내 브랜드 것만 안 보이지?"라는 혼란이 생긴다.

**Files:**
- Create: `app/projects/layout.js`
- Create: `app/projects/page.js`

- [ ] **Step 1: 레이아웃 작성**

`app/projects/layout.js` — `app/requirements/layout.js`와 동일한 구조다:

```jsx
import { IdentityProvider } from '@/components/IdentityProvider';
import { TopBar } from '@/components/TopBar';

export default function ProjectsLayout({ children }) {
  return (
    <IdentityProvider>
      <div className="min-h-screen bg-slate-50">
        <TopBar />
        <main className="p-4">{children}</main>
      </div>
    </IdentityProvider>
  );
}
```

- [ ] **Step 2: 목록 페이지 작성**

`app/projects/page.js`:

```jsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { ProjectFormDialog } from '@/components/ProjectFormDialog';

const STATUS_STYLE = {
  전개예정: 'bg-slate-100 text-slate-500',
  진행중: 'bg-amber-50 text-amber-700',
  적용완료: 'bg-emerald-50 text-emerald-600',
};

export default function ProjectsPage() {
  const { identity } = useIdentity();
  const globalAdmin = isGlobalAdmin(identity);

  const [scope, setScope] = useState('brand'); // 'brand' | 'all'
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (scope === 'brand') params.set('brandId', identity.brandId);
    fetch(`/api/projects?${params.toString()}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '프로젝트를 불러오지 못했습니다.');
        setProjects(d.projects ?? []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, identity.brandId, reloadToken]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">프로젝트</h1>
        {globalAdmin && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            + 새 프로젝트
          </button>
        )}
      </div>

      <div className="flex gap-1">
        <ScopeButton active={scope === 'brand'} onClick={() => setScope('brand')}>
          내 브랜드
        </ScopeButton>
        <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
          전사 전체
        </ScopeButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loaded ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-slate-500">
          {scope === 'brand'
            ? '이 브랜드에 전개된 프로젝트가 없습니다.'
            : '등록된 프로젝트가 없습니다.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">프로젝트</th>
              <th className="py-2">{scope === 'brand' ? '전개 상태' : '브랜드별 전개'}</th>
              <th className="py-2 text-right">진척</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} scope={scope} brandId={identity.brandId} />
            ))}
          </tbody>
        </table>
      )}

      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        teamMembers={teamMembers}
        onSaved={refresh}
      />
    </div>
  );
}

function ScopeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function ProjectRow({ project, scope, brandId }) {
  const mine = project.byBrand.find((b) => b.brandId === brandId);
  const shown = scope === 'brand' ? mine : null;
  const counts = scope === 'brand' ? mine : project.overall;

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2">
        <Link href={`/projects/${project.id}`} className="font-medium text-indigo-600 hover:underline">
          {project.name}
        </Link>
      </td>
      <td className="py-2">
        {shown ? (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              STATUS_STYLE[shown.status] ?? 'bg-slate-100 text-slate-500'
            }`}
          >
            {shown.status}
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {project.byBrand.map((b) => (
              <span
                key={b.brandId}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  STATUS_STYLE[b.status] ?? 'bg-slate-100 text-slate-500'
                }`}
                title={b.status}
              >
                {b.brandName}
              </span>
            ))}
            {project.byBrand.length === 0 && <span className="text-xs text-slate-400">-</span>}
          </span>
        )}
      </td>
      <td className="py-2 text-right text-slate-500">
        {!counts || counts.totalCount === 0 ? '—' : `${counts.doneCount}/${counts.totalCount}건`}
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공. 라우트 목록에 `/projects`가 나타난다.

- [ ] **Step 4: 커밋**

```bash
git add app/projects/layout.js app/projects/page.js
git commit -m "feat: /projects 목록 페이지 추가 (내 브랜드 기본 + 전사 토글)"
```

---

## Task 16: `/projects/[id]` 상세 페이지

상단 전개 현황 카드 + 하단 전 브랜드 통합 칸반. 카드 단위 드래그 권한은 `/api/my-brands`로 받은 브랜드별 등급으로 판정한다.

**Files:**
- Create: `app/projects/[id]/page.js`
- Modify: `components/MergeDialog.jsx` (아래 주의 참조)

> **주의 — `MergeDialog`의 브랜드 가정:** 이 컴포넌트는 `identity.brandId`(로그인 시 고른 브랜드 하나)로 유사 후보를 조회하고 병합 요청을 보낸다. 프로젝트 보드는 여러 브랜드 카드가 섞이므로, 지금 선택한 브랜드가 아닌 카드를 병합하려 하면 서버가 403을 내는데 `.catch(() => {})`가 이를 삼켜 "유사한 요청을 찾지 못했습니다"처럼 보인다. 게다가 "직접 검색" 목록에는 엉뚱한 브랜드 요구사항이 뜬다.
>
> 그래서 `MergeDialog` 안의 브랜드를 `source.brand_id ?? identity.brandId`로 바꾼다. 브랜드 보드의 목록 API는 `brand_id`를 안 내려주므로 그쪽 동작은 그대로다.

- [ ] **Step 1: 페이지 작성**

```jsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin, canProcess, canManageBrand } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';
import { MergeDialog } from '@/components/MergeDialog';
import { ProjectBrandsSection } from '@/components/ProjectBrandsSection';
import { ProjectFormDialog } from '@/components/ProjectFormDialog';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { identity } = useIdentity();
  const globalAdmin = isGlobalAdmin(identity);

  const [data, setData] = useState(null);
  const [myBrands, setMyBrands] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    fetch('/api/my-brands')
      .then((res) => res.json())
      .then((d) => setMyBrands(d.brands ?? []))
      .catch(() => {});
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  // 전개 대상 추가 드롭다운에 쓸 전체 브랜드 목록 — 전체관리자만 필요하다.
  useEffect(() => {
    if (!globalAdmin) return;
    fetch('/api/brands')
      .then((res) => res.json())
      .then((d) => setAllBrands((d.brands ?? []).filter((b) => b.is_active)))
      .catch(() => {});
  }, [globalAdmin]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${id}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '프로젝트를 불러오지 못했습니다.');
        setData(d);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  // 브랜드별 내 등급 — 프로젝트 보드는 카드마다 브랜드가 다르므로 카드 단위로 판정한다.
  const tierByBrand = useMemo(
    () => new Map(myBrands.map((b) => [b.id, b.tier])),
    [myBrands],
  );

  const canEditStatus = useCallback(
    (brandId) => canManageBrand({ isGlobalAdmin: globalAdmin, tier: tierByBrand.get(brandId) }),
    [globalAdmin, tierByBrand],
  );

  const canDragCard = useCallback(
    (req) => canProcess({ isGlobalAdmin: globalAdmin, tier: tierByBrand.get(req.brand_id) }),
    [globalAdmin, tierByBrand],
  );

  // 카드에 브랜드명을 붙인다(KanbanBoard의 showBrandBadge가 이 필드를 읽는다).
  const boardRequirements = useMemo(() => {
    if (!data) return [];
    const nameById = new Map(data.byBrand.map((b) => [b.brandId, b.brandName]));
    return data.requirements.map((r) => ({ ...r, brand_name: nameById.get(r.brand_id) ?? '' }));
  }, [data]);

  const availableBrands = useMemo(() => {
    if (!data) return [];
    const taken = new Set(data.byBrand.map((b) => b.brandId));
    return allBrands.filter((b) => !taken.has(b.id));
  }, [data, allBrands]);

  async function callApi(url, options, failMessage) {
    setActionError('');
    const res = await fetch(url, options);
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? failMessage);
      return false;
    }
    refresh();
    return true;
  }

  async function handleStatusChange(card, newStatus) {
    const prevStatus = card.status;
    setData((prev) =>
      prev
        ? {
            ...prev,
            requirements: prev.requirements.map((r) =>
              r.id === card.id ? { ...r, status: newStatus } : r,
            ),
          }
        : prev,
    );

    const res = await fetch(`/api/requirements/${card.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: card.brand_id, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '상태 변경 실패');
      setData((prev) =>
        prev
          ? {
              ...prev,
              requirements: prev.requirements.map((r) =>
                r.id === card.id ? { ...r, status: prevStatus } : r,
              ),
            }
          : prev,
      );
      return;
    }
    // 진척률을 다시 계산해야 하므로 서버 데이터를 새로 받는다.
    refresh();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/projects" className="text-xs text-slate-500 hover:underline">
            ← 프로젝트 목록
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {data.project.name}
            {!data.project.is_active && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                보관됨
              </span>
            )}
          </h1>
          {data.project.description && (
            <p className="mt-1 text-sm text-slate-500">{data.project.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            총괄 담당자 {data.project.owner?.name ?? '미지정'}
          </p>
        </div>
        {globalAdmin && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            수정
          </button>
        )}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <ProjectBrandsSection
        byBrand={data.byBrand}
        canEditStatus={canEditStatus}
        canManageBrands={globalAdmin}
        availableBrands={availableBrands}
        onChangeStatus={(brandId, status) =>
          callApi(
            `/api/projects/${id}/brands/${brandId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            },
            '전개 상태 변경 실패',
          )
        }
        onAddBrand={(brandId) =>
          callApi(
            `/api/projects/${id}/brands`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brandId }),
            },
            '전개 브랜드 추가 실패',
          )
        }
        onRemoveBrand={(brandId) =>
          callApi(`/api/projects/${id}/brands/${brandId}`, { method: 'DELETE' }, '전개 브랜드 제거 실패')
        }
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-700">
          연결된 요구사항 <span className="text-slate-400">{data.requirements.length}건</span>
        </h2>
        {data.requirements.length === 0 ? (
          <p className="text-sm text-slate-500">
            아직 연결된 요구사항이 없습니다. 요구사항 상세 화면에서 이 프로젝트로 연결하세요.
          </p>
        ) : (
          <KanbanBoard
            requirements={boardRequirements}
            onStatusChange={handleStatusChange}
            onMerge={setMergeSource}
            canDragCard={canDragCard}
            showBrandBadge
          />
        )}
      </section>

      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            refresh();
          }}
        />
      )}

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={data.project}
        teamMembers={teamMembers}
        onSaved={refresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: `canProcess`/`canManageBrand` 시그니처 확인**

Run: `grep -n "export function can" lib/tiers.js`
Expected: 둘 다 `identity` 객체 하나를 받는다 — `canProcess`는 3차 이상, `canManageBrand`는 2차 이상. 여기서 `{ isGlobalAdmin, tier }` 모양으로 넘기는 이유다.

> 원래 이 태스크는 `TIER_RANK`로 직접 비교했지만, 같은 판정이 이미 `lib/tiers.js`에 테스트까지 갖춰 있어서 그쪽을 쓰도록 바꿨다(PJ-Task 6에서 같은 정리를 한 것과 동일한 이유).

- [ ] **Step 3: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공. 라우트 목록에 `/projects/[id]`가 나타난다.

- [ ] **Step 4: 커밋**

```bash
git add "app/projects/[id]/page.js"
git commit -m "feat: 프로젝트 상세 페이지 추가 (전개 현황 + 전 브랜드 통합 칸반)

카드마다 브랜드가 다르므로 /api/my-brands의 브랜드별 등급으로
카드 단위 드래그 권한을 판정한다."
```

---

## Task 17: 요구사항 화면에 프로젝트 연결

등록 폼, 상세 화면, 목록 필터 세 곳을 손본다.

**Files:**
- Modify: `components/RequirementFormDialog.jsx`
- Modify: `components/RequirementDetail.jsx`
- Modify: `components/FilterBar.jsx`
- Modify: `app/requirements/page.js`

- [ ] **Step 1: 등록 폼에 프로젝트 드롭다운 추가**

`components/RequirementFormDialog.jsx`를 네 군데 고친다.

1) `emptyForm()`에 `projectId` 추가:

```js
function emptyForm() {
  return {
    title: '',
    priority: '',
    urgency: '',
    requestDate: todayLocal(),
    category: 'none',
    projectId: 'none',
    asIs: '',
    toBe: '',
    note: '',
    isConfidential: false,
  };
}
```

2) props에 `projects` 추가:

```js
export function RequirementFormDialog({ open, onOpenChange, categories, projects, identity, onCreated }) {
```

3) `handleSubmit`에서 등록 성공 후 프로젝트를 연결한다. `const created = data.requirement;` 바로 아래에 다음 블록을 넣는다:

```js
      // 프로젝트 연결은 POST가 아니라 PATCH로 한다 — 전개 대상 브랜드 자동 추가
      // 규칙이 그 라우트에만 있기 때문이다(Task 10 참조).
      if (form.projectId !== 'none' && created?.id) {
        const linkRes = await fetch(`/api/requirements/${created.id}/project`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: form.projectId }),
        });
        if (!linkRes.ok) {
          const linkData = await linkRes.json();
          // 본문은 이미 저장됐다. 상세 화면에서 다시 연결할 수 있으므로 경고만 남긴다.
          setError(`요구사항은 등록됐지만 프로젝트 연결에 실패했습니다: ${linkData.error ?? ''}`);
        }
      }
```

4) 카테고리 드롭다운 블록(`<div className="flex flex-col gap-1">` … `</Select></div>`) 바로 아래에 프로젝트 드롭다운을 추가한다:

```jsx
          <div className="flex flex-col gap-1">
            <Label htmlFor="projectId">프로젝트</Label>
            <Select
              items={[
                { value: 'none', label: '선택 안 함' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={form.projectId}
              onValueChange={(value) => updateField('projectId', value)}
            >
              <SelectTrigger id="projectId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">선택 안 함</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 2: 필터바에 프로젝트 필터 추가**

`components/FilterBar.jsx`를 두 군데 고친다.

1) props에 `projects` 추가:

```js
export function FilterBar({ teamMembers, categories, projects, value, onChange }) {
```

2) 우선순위 `FilterSelect` 아래에 프로젝트 필터를 넣고, 초기화 조건과 초기화 대상에 `project`를 더한다:

```jsx
      <FilterSelect
        placeholder="프로젝트"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        current={value.project}
        onPick={(v) => onChange({ project: v })}
      />
      {(value.assignee || value.category || value.priority || value.project) && (
        <button
          type="button"
          onClick={() => onChange({ assignee: '', category: '', priority: '', project: '' })}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          필터 초기화
        </button>
      )}
```

- [ ] **Step 3: 목록 페이지에서 프로젝트 목록을 불러와 연결**

`app/requirements/page.js`를 네 군데 고친다.

1) 상태 추가 — `const [teamMembers, setTeamMembers] = useState([]);` 아래:

```js
  const [projects, setProjects] = useState([]);
```

2) 필터 초기값에 `project` 추가:

```js
  const [filters, setFilters] = useState({ assignee: '', category: '', priority: '', project: '' });
```

3) 첫 번째 `useEffect`(팀원·카테고리 로드) 안에 프로젝트 로드를 추가한다. 현재 브랜드에 전개된 프로젝트를 먼저 보여주기 위해 `brandId`를 붙여 조회하되, 그 외 프로젝트도 고를 수 있어야 하므로 전체도 함께 받아 앞뒤로 이어붙인다:

```js
    Promise.all([
      fetch(`/api/projects?brandId=${identity.brandId}`).then((r) => r.json()),
      fetch('/api/projects').then((r) => r.json()),
    ])
      .then(([mine, all]) => {
        const mineList = mine.projects ?? [];
        const mineIds = new Set(mineList.map((p) => p.id));
        const others = (all.projects ?? []).filter((p) => !mineIds.has(p.id));
        // 대부분 자기 브랜드에 전개된 프로젝트를 고르므로 그쪽을 위에 둔다.
        setProjects([...mineList, ...others]);
      })
      .catch(() => {});
```

4) 목록 조회 `useEffect`의 쿼리 파라미터에 프로젝트를 추가한다 — `if (filters.priority) params.set('priority', filters.priority);` 아래:

```js
    if (filters.project) params.set('project', filters.project);
```

5) `FilterBar`와 `RequirementFormDialog`에 `projects`를 넘긴다:

```jsx
      <FilterBar
        teamMembers={teamMembers}
        categories={categories}
        projects={projects}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />
```

```jsx
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        projects={projects}
        identity={identity}
        onCreated={refreshRequirements}
      />
```

- [ ] **Step 4: 상세 화면에 프로젝트 배지 + 연결/해제 추가**

`components/RequirementDetail.jsx`를 세 군데 고친다.

1) import는 손댈 필요가 없다. `Link`(4행), `Select` 계열(16행), `useCallback/useEffect/useState`(3행)가 이미 모두 import되어 있다.

2) 프로젝트 목록 상태와 로드를 추가한다. `processAllowed`를 정의한 줄 아래에 상태를 넣고:

```js
  const [projects, setProjects] = useState([]);
```

컴포넌트 안의 다른 `useEffect` 옆에 다음을 추가한다:

```js
  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);
```

3) 프로젝트 변경 핸들러를 추가한다(다른 핸들러들 옆):

```js
  async function changeProject(nextProjectId) {
    setActionError('');
    const res = await fetch(`/api/requirements/${id}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: nextProjectId === 'none' ? null : nextProjectId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '프로젝트 변경 실패');
      return;
    }
    load();
  }
```

> `load`는 `components/RequirementDetail.jsx:41`에 이미 있는 `useCallback` 함수다(상세를 다시 불러온다). 새로 만들지 않는다.

4) 사이드바에 프로젝트 항목을 넣는다. `<MetaRow label="카테고리" ... />` 바로 위에 다음을 추가한다:

```jsx
          <div>
            <p className="text-slate-500">프로젝트</p>
            {processAllowed ? (
              <Select
                items={[
                  { value: 'none', label: '선택 안 함' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={r.project_id ?? 'none'}
                onValueChange={changeProject}
              >
                <SelectTrigger className="mt-1 h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : r.project ? (
              <Link
                href={`/projects/${r.project.id}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {r.project.name}
              </Link>
            ) : (
              <p className="font-medium text-slate-900">-</p>
            )}
          </div>
```

- [ ] **Step 5: 상세 API가 `project`를 반환하는지 확인하고, 없으면 추가**

Run: `grep -n "project" "app/api/requirements/[id]/route.js"`

`select`에 `project_id, project:projects(id, name)`이 없으면 GET의 `.select(...)` 문자열에 추가한다. 요구사항 목록 API(Task 10)와 같은 형태다.

- [ ] **Step 6: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 7: 커밋**

```bash
git add components/RequirementFormDialog.jsx components/RequirementDetail.jsx components/FilterBar.jsx app/requirements/page.js "app/api/requirements/[id]/route.js"
git commit -m "feat: 요구사항 등록/상세/필터에 프로젝트 연결 추가

등록은 POST 후 PATCH로 연결한다 — 전개 대상 자동 추가 규칙을
한 곳(PATCH 라우트)에만 두기 위함이다."
```

---

## Task 18: TopBar에 `프로젝트` 링크 추가

**Files:**
- Modify: `components/TopBar.jsx`

- [ ] **Step 1: 링크 추가**

`components/TopBar.jsx`에서 `목록` 링크 블록 바로 아래, `보드` 링크 위에 다음을 넣는다. 프로젝트 조회는 로그인만 필요하므로 등급 조건 없이 모두에게 보인다:

```jsx
        <Link href="/projects" className="text-slate-500 hover:text-slate-700">
          프로젝트
        </Link>
```

- [ ] **Step 2: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 커밋**

```bash
git add components/TopBar.jsx
git commit -m "feat: TopBar에 프로젝트 링크 추가"
```

---

## Task 19: 대시보드에 프로젝트 섹션 추가

**Files:**
- Modify: `app/api/dashboard/route.js`
- Modify: `app/admin/dashboard/page.js`

- [ ] **Step 1: 대시보드 API에 프로젝트 집계 추가**

`app/api/dashboard/route.js`의 import에 다음을 더한다:

```js
import { computeProjectProgress, findProgressMismatches } from '@/lib/projectProgress';
import { DEPLOY_PLANNED, DEPLOY_IN_PROGRESS, DEPLOY_DONE } from '@/lib/projectStatuses';
```

`const stats = computeDashboardStats({ requirements, brands, periodDays, today });` 아래, `return` 위에 다음 블록을 넣는다:

```js
    // ── 프로젝트 집계 ────────────────────────────────────────────────
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (projectsError) throw projectsError;

    const projectIds = (projects ?? []).map((p) => p.id);
    let projectBrands = [];
    let projectRequirements = [];
    if (projectIds.length > 0) {
      const [pbResult, reqResult] = await Promise.all([
        supabase.from('project_brands').select('project_id, brand_id, status').in('project_id', projectIds),
        supabase.from('requirements').select('project_id, brand_id, status').in('project_id', projectIds),
      ]);
      if (pbResult.error) throw pbResult.error;
      if (reqResult.error) throw reqResult.error;
      projectBrands = pbResult.data ?? [];
      projectRequirements = reqResult.data ?? [];
    }

    const projectsWithProgress = (projects ?? []).map((p) => {
      const progress = computeProjectProgress({
        requirements: projectRequirements.filter((r) => r.project_id === p.id),
        projectBrands: projectBrands.filter((pb) => pb.project_id === p.id),
        brands,
      });
      return {
        projectId: p.id,
        projectName: p.name,
        byBrand: progress.byBrand,
        overall: progress.overall,
      };
    });

    const deployCounts = {
      [DEPLOY_PLANNED]: 0,
      [DEPLOY_IN_PROGRESS]: 0,
      [DEPLOY_DONE]: 0,
    };
    for (const pb of projectBrands) {
      if (deployCounts[pb.status] !== undefined) deployCounts[pb.status] += 1;
    }

    const projectSummary = {
      activeProjectCount: projects?.length ?? 0,
      plannedBrandCount: deployCounts[DEPLOY_PLANNED],
      inProgressBrandCount: deployCounts[DEPLOY_IN_PROGRESS],
      doneBrandCount: deployCounts[DEPLOY_DONE],
    };

    const mismatches = findProgressMismatches(projectsWithProgress);
```

그리고 `return Response.json(stats);`를 다음으로 바꾼다:

```js
    return Response.json({
      ...stats,
      projectSummary,
      projects: projectsWithProgress,
      mismatches,
    });
```

- [ ] **Step 2: 대시보드 화면에 프로젝트 섹션 추가**

`app/admin/dashboard/page.js`의 브랜드 카드 그리드(`{data.byBrand.length === 0 ? ... }`) 블록 바로 아래, 바깥 `</div>` 위에 다음을 넣는다:

```jsx
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-slate-700">프로젝트</h2>

        <div className="grid grid-cols-4 gap-3">
          <SummaryCard label="활성 프로젝트" value={data.projectSummary.activeProjectCount} />
          <SummaryCard label="전개예정" value={data.projectSummary.plannedBrandCount} />
          <SummaryCard label="진행중" value={data.projectSummary.inProgressBrandCount} />
          <SummaryCard label="적용완료" value={data.projectSummary.doneBrandCount} />
        </div>

        {data.mismatches.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">확인 필요</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
              {data.mismatches.map((m) => (
                <li key={`${m.projectId}-${m.brandId}`}>
                  <Link href={`/projects/${m.projectId}`} className="underline hover:no-underline">
                    {m.projectName}
                  </Link>
                  {' · '}
                  {m.brandName} — 적용완료인데 미완료 {m.remainingCount}건
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.projects.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 프로젝트가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">프로젝트</th>
                <th className="py-2 text-right">전개 브랜드</th>
                <th className="py-2 text-right">적용완료</th>
                <th className="py-2 text-right">전체 진척</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.projectId} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/projects/${p.projectId}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {p.projectName}
                    </Link>
                  </td>
                  <td className="py-2 text-right text-slate-500">{p.byBrand.length}</td>
                  <td className="py-2 text-right text-slate-500">
                    {p.byBrand.filter((b) => b.status === DEPLOY_DONE).length}
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {p.overall.totalCount === 0
                      ? '—'
                      : `${p.overall.doneCount}/${p.overall.totalCount}건`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
```

이 파일에는 `Link`와 `DEPLOY_DONE`이 아직 import되어 있지 않다. 상단에 두 줄을 추가한다:

```js
import Link from 'next/link';
import { DEPLOY_DONE } from '@/lib/projectStatuses';
```

- [ ] **Step 3: lint + build 확인**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 4: 커밋**

```bash
git add app/api/dashboard/route.js app/admin/dashboard/page.js
git commit -m "feat: 대시보드에 프로젝트 섹션 + 불일치 알림 추가"
```

---

## Task 20: 전체 검증 — 마이그레이션 + 브라우저 통합

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test -- --run`
Expected: PASS (73 tests)

- [ ] **Step 2: lint + build**

Run: `npm run lint && npm run build`
Expected: 둘 다 성공.

- [ ] **Step 3: 환경변수 파일 준비**

이 워크트리에는 `.env.local`이 없다(gitignore 대상이라 브랜치를 따라오지 않는다). `.env.local.example`을 복사한 뒤 Supabase 프로젝트 설정 > API에서 값을 채운다:

```bash
cp .env.local.example .env.local
```

필요한 값 네 개: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 4: 마이그레이션 실행 확인**

Task 1의 `0006_projects.sql`이 아직 실행되지 않았다면 지금 Supabase SQL Editor에서 실행한다. Table Editor에서 `projects`, `project_brands`가 있는지, `requirements.project_id`가 있는지 확인한다.

- [ ] **Step 5: 개발 서버 기동**

Run: `npm run dev`
브라우저에서 `http://localhost:3000` 접속 → 로그인.

- [ ] **Step 6: 브라우저 시나리오 — 프로젝트 생성과 전개**

1. 전체관리자로 로그인 → TopBar `프로젝트` 클릭 → 빈 목록 확인
2. `+ 새 프로젝트` → 이름 `빠른배송 시스템 개발`, 총괄 담당자 지정 → 저장
3. 목록에 나타나는지 확인 (`내 브랜드` 탭에서는 안 보이고 `전사 전체`에서 보여야 정상 — 아직 전개 브랜드가 없으므로)
4. 프로젝트 클릭 → 상세 진입 → `전개 브랜드 추가`로 스파오 추가 → `전개예정` 상태로 들어가는지 확인
5. 미쏘(또는 다른 브랜드) 추가
6. 스파오 상태를 `진행중`으로 변경 → 즉시 반영되는지 확인

- [ ] **Step 7: 브라우저 시나리오 — 요구사항 연결과 자동 브랜드 추가**

1. `/requirements`로 이동 → 기존 요구사항 하나 열기 → 사이드바 `프로젝트`에서 방금 만든 프로젝트 선택
2. 프로젝트 상세로 돌아가 → 그 요구사항이 칸반에 나타나고 브랜드 배지가 붙는지 확인
3. 전개 대상이 **아닌** 브랜드로 전환해 요구사항을 하나 더 연결 → 프로젝트 상세에서 그 브랜드가 `진행중`으로 **자동 추가**됐는지 확인 (4절 규칙)
4. 진척률이 `0/1건` 형태로 표시되는지, 요구사항을 완료로 바꾸면 `1/1건`이 되는지 확인

- [ ] **Step 8: 브라우저 시나리오 — 권한**

1. 3차 실무자 계정으로 로그인 → `프로젝트` 메뉴가 보이는지, `+ 새 프로젝트` 버튼은 **안 보이는지** 확인
2. 프로젝트 상세에서 전개 상태 드롭다운이 **비활성**(배지로만 표시)인지 확인
3. 자기 브랜드 카드는 드래그되고, 권한 없는 브랜드 카드는 `권한 없음`으로 잠기는지 확인
4. 요구사항 상세에서 프로젝트 연결/해제가 되는지 확인

- [ ] **Step 9: 브라우저 시나리오 — 제거 거절과 대시보드**

1. 전체관리자로 돌아가 → 요구사항이 연결된 브랜드를 전개 대상에서 `제거` 시도 → **거절 메시지에 남은 건수가 나오는지** 확인
2. 그 브랜드의 요구사항 연결을 모두 해제한 뒤 다시 제거 → 성공하는지 확인
3. 어떤 브랜드를 `적용완료`로 바꾸되 미완료 요구사항을 남겨둔다
4. `/admin/dashboard` → 프로젝트 섹션의 요약 카드 4개, 프로젝트 테이블, **확인 필요(불일치) 목록**에 그 조합이 뜨는지 확인

- [ ] **Step 10: 회귀 확인**

1. `/requirements/board` — 기존 브랜드 칸반이 그대로 동작하는지(드래그로 상태 변경, 중복처리) 확인. Task 11에서 데이터 소유를 페이지로 옮겼으므로 반드시 확인한다.
2. `/requirements` 목록의 프로젝트 필터가 동작하는지 확인
3. `/admin/dashboard`의 기존 브랜드 통계가 그대로인지 확인

- [ ] **Step 11: 발견된 수정 사항 커밋**

브라우저 검증 중 고친 게 있다면 그 변경분만 별도로 커밋한다.

```bash
git add -A
git commit -m "fix: 브라우저 검증에서 발견된 수정"
```

---

## 실행 후

모든 태스크가 끝나면 `superpowers:subagent-driven-development`의 마지막 단계에 따라 전체 diff에 대한 최종 코드 리뷰를 한 번 돌리고, `superpowers:finishing-a-development-branch`로 브랜치를 마무리한다.

