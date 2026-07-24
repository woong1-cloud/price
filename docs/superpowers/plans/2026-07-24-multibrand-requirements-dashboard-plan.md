# 통합 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1차(전체 관리자)가 전체 브랜드의 처리 현황과 처리속도를 한눈에 보고, 특정 브랜드로 바로 파고들 수 있는 통합 대시보드(`/admin/dashboard`)를 만든다.

**Architecture:** 새 API 라우트(`GET /api/dashboard`)가 활성 브랜드와 최소 컬럼의 요구사항을 한 번에 조회하고, 순수 함수(`lib/dashboardStats.js`)가 기간별 신규/완료/미해결/평균소요일을 계산한다. 페이지는 기간 토글 + 요약 카드 + 브랜드별 카드 그리드로 구성되고, 카드 클릭 시 기존 `saveIdentity` → `router.push` 패턴으로 그 브랜드의 `/requirements`로 전환한다.

**Tech Stack:** Next.js 16(App Router, JS) + React 19 + Tailwind v4 + Supabase(Postgres) + Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-07-24-multibrand-requirements-dashboard-design.md`

**테스트 전략 (기존 관례와 동일):** 순수 로직(`computeDashboardStats`)만 Vitest로 TDD. API 라우트와 UI는 라우트 단위 테스트 파일을 만들지 않고, `npm run lint`로 구문 오류를 확인한 뒤 마지막 태스크에서 실제 브라우저로 전체 플로우를 검증한다.

**작업 위치:** 모든 파일 경로는 `pj/` 기준 상대 경로다.

---

## 파일 구조

**신규 생성**

| 파일 | 책임 |
|---|---|
| `lib/dashboardStats.js` | 브랜드별/전체 통계를 계산하는 순수 함수 |
| `lib/dashboardStats.test.js` | 위 함수 단위 테스트 |
| `app/api/dashboard/route.js` | `GET` — 활성 브랜드 + 요구사항 최소 컬럼 조회 후 통계 계산 |
| `app/admin/dashboard/page.js` | 대시보드 화면(1차 전용) |

**수정**

| 파일 | 변경 내용 |
|---|---|
| `components/TopBar.jsx` | "브랜드 관리" 옆에 "대시보드" 링크 추가(`isGlobalAdmin`일 때만 표시) |

---

## Task 1: `computeDashboardStats` 순수 함수 (TDD)

**Files:**
- Create: `lib/dashboardStats.js`
- Create: `lib/dashboardStats.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// lib/dashboardStats.test.js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/dashboardStats.test.js`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현**

```js
// lib/dashboardStats.js
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

    const openCount = brandReqs.filter((r) => r.status !== '완료' && r.status !== '중복').length;

    const newInPeriod = brandReqs.filter((r) => cutoff === null || r.request_date >= cutoff).length;

    const completedReqs = brandReqs.filter(
      (r) => r.status === '완료' && (cutoff === null || dateOnly(r.completed_at) >= cutoff)
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/dashboardStats.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/dashboardStats.js lib/dashboardStats.test.js
git commit -m "$(cat <<'EOF'
feat: 대시보드 통계 집계용 computeDashboardStats 추가

EOF
)"
```

---

## Task 2: API `GET /api/dashboard`

**Files:**
- Create: `app/api/dashboard/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/dashboard/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { computeDashboardStats } from '@/lib/dashboardStats';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const daysParam = searchParams.get('days');
    const periodDays = daysParam === '7' || daysParam === '30' ? Number(daysParam) : null;

    const supabase = getSupabaseAdmin();
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (brandsError) throw brandsError;

    let requirements = [];
    if (brands.length > 0) {
      const brandIds = brands.map((b) => b.id);
      const { data, error: reqError } = await supabase
        .from('requirements')
        .select('id, brand_id, status, request_date, completed_at')
        .in('brand_id', brandIds);
      if (reqError) throw reqError;
      requirements = data ?? [];
    }

    const today = new Date().toISOString().slice(0, 10);
    const stats = computeDashboardStats({ requirements, brands, periodDays, today });
    return Response.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}
```

Then run lint and commit:

```bash
npm run lint
git add app/api/dashboard/route.js
git commit -m "$(cat <<'EOF'
feat: 통합 대시보드 통계 API 추가

EOF
)"
```

## Context

`requireGlobalAdmin(memberId)` (기존, `lib/permissions.js`)이 1차만 접근 가능하도록 서버에서 재검증한다. `computeDashboardStats`(Task 1)가 실제 계산을 담당하므로 이 라우트는 데이터 조회 + 함수 호출만 한다. `days` 파라미터가 `'7'`/`'30'`이 아니면(없음, `'all'`, 잘못된 값 등) 전체 기간(`periodDays: null`)으로 처리한다 — 이 내부 관리 API는 별도 400 검증을 하지 않는다.

## Before You Begin

If anything is unclear, ask now.

## Your Job

1. Task 1이 이미 완료되어 있어야 한다(`lib/dashboardStats.js`의 `computeDashboardStats`를 import해서 씀).
2. 파일을 정확히 위 내용대로 작성한다.
3. `npm run lint` 실행 후 0 new errors 확인.
4. 정확한 메시지로 커밋한다.

이 파일은 별도 단위 테스트가 없다(이 프로젝트는 DB I/O가 있는 API 라우트를 유닛 테스트하지 않고, 마지막 태스크의 브라우저 통합 검증으로 확인한다).

Work from: `C:\Users\han_jiwoong\Desktop\agent\.worktrees\multibrand-requirements-app\pj`

## Before Reporting Back: Self-Review

- 파일이 스펙과 정확히 일치하는가?
- `computeDashboardStats` import 경로가 맞는가?
- lint가 통과하는가?

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 구현한 내용
- lint 결과
- 변경된 파일
- 자체 리뷰 결과(있다면)

---

## Task 3: `/admin/dashboard` 페이지

**Files:**
- Create: `app/admin/dashboard/page.js`

- [ ] **Step 1: 페이지 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { saveIdentity } from '@/lib/identity';

const PERIODS = [
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: 'all', label: '전체' },
];

export default function AdminDashboardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const globalAdmin = isGlobalAdmin(identity);

  const [period, setPeriod] = useState('7');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!globalAdmin) router.replace('/requirements');
  }, [globalAdmin, router]);

  useEffect(() => {
    if (!globalAdmin) return undefined;
    let cancelled = false;
    fetch(`/api/dashboard?memberId=${identity.memberId}&days=${period}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '대시보드 데이터를 불러오지 못했습니다.');
        setData(d);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [globalAdmin, identity.memberId, period]);

  function goToBrand(brandId) {
    saveIdentity({ ...identity, brandId, tier: '1차' });
    router.push('/requirements');
  }

  if (!globalAdmin) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">대시보드</h1>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                period === p.value ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="브랜드 수" value={data.overall.brandCount} />
        <SummaryCard label="전체 미해결" value={data.overall.openCount} />
        <SummaryCard label="선택 기간 완료" value={data.overall.completedInPeriod} />
      </div>

      {data.byBrand.length === 0 ? (
        <p className="text-sm text-slate-500">표시할 브랜드가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.byBrand.map((b) => (
            <button
              key={b.brandId}
              type="button"
              onClick={() => goToBrand(b.brandId)}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:shadow-sm"
            >
              <p className="font-medium text-slate-900">{b.brandName}</p>
              <dl className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                <div className="flex justify-between">
                  <dt>미해결</dt>
                  <dd className="font-medium text-slate-900">{b.openCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>완료</dt>
                  <dd className="font-medium text-slate-900">{b.completedInPeriod}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>평균 소요일</dt>
                  <dd className="font-medium text-slate-900">
                    {b.avgCompletionDays === null ? '-' : `${b.avgCompletionDays.toFixed(1)}일`}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
```

Then run lint and commit:

```bash
npm run lint
git add app/admin/dashboard/page.js
git commit -m "$(cat <<'EOF'
feat: 통합 대시보드 화면(/admin/dashboard) 추가

EOF
)"
```

## Context

`app/admin/layout.js`(기존, Phase 3에서 이미 `IdentityProvider`+`TopBar`로 감싸둠) 하위에 자동으로 배치된다 — 이 파일은 별도 레이아웃 작업이 필요 없다. 리다이렉트 게이트(`useEffect` + `router.replace` + 조기 반환 `<p>`)는 `app/admin/brands/page.js`와 정확히 같은 패턴이다. `goToBrand`의 `saveIdentity({ ...identity, brandId, tier: '1차' })` → `router.push('/requirements')`는 진입 화면(`app/page.js`)의 `handleSubmit`이 이미 쓰는 "저장 후 즉시 이동" 패턴을 그대로 재사용한다 — 1차는 어느 브랜드든 접근 가능하므로 tier는 항상 `'1차'`로 고정한다.

## Before You Begin

If anything is unclear, ask now.

## Your Job

1. Task 2가 이미 완료되어 있어야 한다(`/api/dashboard`를 호출).
2. 파일을 정확히 위 내용대로 작성한다.
3. `npm run lint` 실행 후 0 new errors 확인. **만약 이 파일이 `react-hooks/set-state-in-effect` 같은 린트 규칙에 걸리면(이 프로젝트에서 다이얼로그 컴포넌트들에서 몇 차례 있었던 문제) — 이 페이지의 두 `useEffect`는 모두 "데이터 페칭 후 콜백에서 setState" 패턴이라 그 규칙에 걸리지 않아야 정상이다. 걸린다면 최소한으로 수정하고 그 이유를 자체 리뷰에 명확히 남겨라.**
4. 정확한 메시지로 커밋한다.

이 파일은 별도 단위 테스트가 없다.

Work from: `C:\Users\han_jiwoong\Desktop\agent\.worktrees\multibrand-requirements-app\pj`

## Before Reporting Back: Self-Review

- 파일이 스펙과 정확히 일치하는가?
- lint가 통과하는가?
- 리다이렉트 게이트가 `app/admin/brands/page.js`의 패턴과 일치하는가?

## Report Format

Report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- 구현한 내용
- lint 결과
- 변경된 파일
- 자체 리뷰 결과(있다면)

---

## Task 4: TopBar "대시보드" 링크

**Files:**
- Modify: `components/TopBar.jsx`

- [ ] **Step 1: 링크 추가**

현재 `components/TopBar.jsx`에는 다음 블록이 있다(Phase 3에서 추가됨):

```jsx
        {globalAdmin && (
          <Link href="/admin/brands" className="text-slate-500 hover:text-slate-700">
            브랜드 관리
          </Link>
        )}
```

바로 다음 줄에 아래를 추가한다:

```jsx
        {globalAdmin && (
          <Link href="/admin/dashboard" className="text-slate-500 hover:text-slate-700">
            대시보드
          </Link>
        )}
```

수정된 `components/TopBar.jsx` 전체(참고용 — 실제로는 위 블록만 추가하면 된다):

```jsx
'use client';

import Link from 'next/link';
import { useIdentity } from './IdentityProvider';
import { canManage, isGlobalAdmin } from '@/lib/tiers';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  const manage = canManage(identity);
  const globalAdmin = isGlobalAdmin(identity);
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-slate-900">{identity.name}</span>
        {identity.isGlobalAdmin && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            전체 관리자
          </span>
        )}
        <Link href="/requirements" className="text-slate-500 hover:text-slate-700">
          목록
        </Link>
        {manage && (
          <Link href="/requirements/board" className="text-slate-500 hover:text-slate-700">
            보드
          </Link>
        )}
        {manage && (
          <Link href="/requirements/settings" className="text-slate-500 hover:text-slate-700">
            설정
          </Link>
        )}
        {globalAdmin && (
          <Link href="/admin/brands" className="text-slate-500 hover:text-slate-700">
            브랜드 관리
          </Link>
        )}
        {globalAdmin && (
          <Link href="/admin/dashboard" className="text-slate-500 hover:text-slate-700">
            대시보드
          </Link>
        )}
      </div>
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
    </header>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add components/TopBar.jsx
git commit -m "$(cat <<'EOF'
feat: TopBar에 대시보드 링크 추가

EOF
)"
```

---

## Task 5: 전체 단위 테스트 재확인 + 브라우저 통합 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 35개 + 이번에 추가한 `dashboardStats.test.js`(9) = 44개)

- [ ] **Step 2: 린트 + 빌드 확인**

Run: `npm run lint && npm run build`
Expected: lint 0 errors, build 성공, 라우트 목록에 `/admin/dashboard`와 `/api/dashboard` 포함 확인

- [ ] **Step 3: 브라우저 시나리오 — 대시보드 조회 및 전환**

dev 서버(`npm run dev`) 실행 후 브라우저에서:
1. 1차 계정으로 로그인 → TopBar에 "대시보드" 링크가 보이는지 확인 → 클릭해서 `/admin/dashboard` 진입.
2. 요약 카드 3개(브랜드 수/전체 미해결/선택 기간 완료)와 브랜드별 카드가 실제 데이터와 맞는지 확인(필요하면 `/api/dashboard?memberId=<1차ID>&days=7`를 직접 호출해 응답과 화면 숫자를 대조).
3. 기간 토글을 7일 → 30일 → 전체로 바꿔가며 숫자가 바뀌는지 확인(미해결 숫자는 기간을 바꿔도 그대로여야 한다).
4. 브랜드 카드 하나를 클릭 → 그 브랜드로 전환되어 `/requirements`로 이동하는지, 목록이 그 브랜드의 실제 데이터인지 확인.
5. TopBar에서 그 브랜드가 선택된 상태로 계속 탐색 가능한지 확인(다른 화면 이동 시 브랜드가 유지되는지).

- [ ] **Step 4: 브라우저 시나리오 — 접근 제어**

1. 2차 계정으로 전환 → 주소창에 직접 `/admin/dashboard` 입력 → `/requirements`로 리다이렉트되는지, TopBar에 "대시보드" 링크가 안 보이는지 확인.
2. 3차 계정으로도 동일하게 확인.

- [ ] **Step 5: 최종 커밋(필요 시)**

브라우저 검증 중 발견된 사소한 수정이 있었다면 그 변경분만 별도로 커밋한다. 문제 없었다면 이 태스크는 커밋 없이 종료.

---

## 스펙 커버리지 자체 점검

- `GET /api/dashboard`(memberId/days 파라미터, requireGlobalAdmin) → Task 2 ✅
- `computeDashboardStats`(미해결/신규/완료/평균소요일/전체 합계, 기간 처리) → Task 1 ✅
- `/admin/dashboard` UI(기간 토글, 요약 카드, 브랜드 카드, 클릭 시 브랜드 전환) → Task 3 ✅
- TopBar "대시보드" 링크(1차 전용) → Task 4 ✅
- 접근 제어(클라이언트 게이팅 + 서버 재검증, 2차/3차 리다이렉트) → Task 3(클라이언트) + Task 2(서버) + Task 5(검증) ✅
- 빈 브랜드/에러 처리 → Task 3 ✅
- 순수 로직 Vitest 테스트(경계값, null 처리, 합계 일치) → Task 1 ✅
- 데이터 모델 변경 없음 → 계획에도 마이그레이션 태스크 없음, 일치 ✅
