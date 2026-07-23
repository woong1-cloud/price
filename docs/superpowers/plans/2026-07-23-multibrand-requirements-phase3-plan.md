# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 3단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브랜드/팀원/카테고리 관리를 SQL 시드가 아닌 화면(브랜드 관리 `/admin/brands`, 브랜드 설정 `/requirements/settings`)에서 처리할 수 있게 한다.

**Architecture:** 기존 컨벤션(라우트 1개 = 단일 책임, `requireBrandAccess`/`ApiError`/`errorResponse`, 클라이언트 게이팅 함수 + 서버 재검증 쌍)을 그대로 확장한다. 브랜드 생성만 `create_brand_with_admin` Postgres 함수로 원자적으로 처리하고, 나머지는 일반 CRUD.

**Tech Stack:** Next.js 16(App Router, JS) + React 19 + Tailwind v4 + shadcn/ui(`@base-ui/react`) + Supabase(Postgres) + Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-07-23-multibrand-requirements-phase3-design.md`

**테스트 전략 (기존 1·2단계와 동일):** 순수 로직(`isGlobalAdmin`, `checkLastBrandAdmin`)만 Vitest로 TDD한다. API 라우트와 UI는 이 프로젝트에 라우트 단위 테스트 파일이 없다는 기존 관례를 따라 유닛 테스트를 만들지 않고, 각 태스크에서 `npm run lint`로 구문 오류만 확인한 뒤 마지막 태스크에서 실제 브라우저로 전체 플로우를 검증한다.

**작업 위치:** 모든 파일 경로는 `pj/` 기준 상대 경로다 (예: `app/api/brands/route.js` → 실제로는 `pj/app/api/brands/route.js`).

---

## 파일 구조

**신규 생성**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0003_phase3.sql` | `create_brand_with_admin` 함수 |
| `lib/checkLastBrandAdmin.js` | "마지막 2차 관리자인가" 순수 판정 함수 |
| `lib/checkLastBrandAdmin.test.js` | 위 함수 단위 테스트 |
| `lib/tiers.test.js` | `isGlobalAdmin` 단위 테스트 |
| `app/api/brands/route.js` | `GET`(전체 브랜드) / `POST`(생성) |
| `app/api/brands/[id]/route.js` | `PATCH`(수정/활성 토글) |
| `app/api/team-members/[id]/route.js` | `PATCH`(이름/재직여부 수정) |
| `app/api/brand-team/route.js` | `GET`(브랜드 배치 목록) / `POST`(배치) |
| `app/api/brand-team/[targetMemberId]/route.js` | `PATCH`(tier/역할 변경) / `DELETE`(해제) |
| `app/api/brand-categories/[id]/route.js` | `PATCH`(이름/순서) / `DELETE`(사용중 아니면) |
| `components/BrandFormDialog.jsx` | 브랜드 생성/수정 다이얼로그 |
| `components/TeamMemberFormDialog.jsx` | 신규 직원 등록 다이얼로그 |
| `components/BrandTeamSection.jsx` | 브랜드 설정 — 배치된 팀원 테이블 + 인라인 수정/해제 |
| `components/BrandTeamAssignDialog.jsx` | 브랜드 설정 — 신규 배치 다이얼로그 |
| `components/CategorySettings.jsx` | 브랜드 설정 — 카테고리 목록/추가/순서/삭제 |
| `app/admin/brands/page.js` | 브랜드 관리 화면(1차 전용) |
| `app/requirements/settings/page.js` | 브랜드 설정 화면(2차 이상) |

**수정**

| 파일 | 변경 내용 |
|---|---|
| `lib/tiers.js` | `isGlobalAdmin(identity)` 추가 |
| `lib/permissions.js` | `requireGlobalAdmin(memberId)` 추가 |
| `app/api/team-members/route.js` | `GET`에 `includeInactive` 쿼리 지원 + `is_active` 필드 반환, `POST`(신규 등록) 추가 |
| `app/api/brand-categories/route.js` | `POST`(카테고리 추가) 추가 |
| `components/TopBar.jsx` | "설정"(2차 이상) / "브랜드 관리"(1차) 링크 추가 |

**설계 스펙과의 차이 — API 보강 1건:** 스펙의 API 목록에는 브랜드 설정 화면이 "현재 배치된 팀원"을 읽어올 `GET`이 빠져 있다(쓰기 라우트만 나열됨). 기존 컨벤션(같은 파일에 `GET`+`POST` 공존, 예: `app/api/requirements/route.js`)을 따라 `app/api/brand-team/route.js`에 `GET`을 추가한다 — 없으면 브랜드 설정 화면이 데이터를 표시할 방법이 없다.

---

## Task 1: 마이그레이션 0003 — `create_brand_with_admin` 함수

**Files:**
- Create: `supabase/migrations/0003_phase3.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql, 0002_phase2.sql 실행 이후)

-- 브랜드와 그 브랜드의 최초 2차 관리자를 한 트랜잭션으로 함께 만든다.
-- (관리자 없는 브랜드가 남는 부분 실패를 원천 차단)
create or replace function create_brand_with_admin(
  p_name text,
  p_code text,
  p_workflow_template text,
  p_admin_member_id uuid,
  p_created_by uuid
) returns uuid language plpgsql as $$
declare
  v_brand_id uuid;
begin
  insert into brands (name, code, workflow_template, created_by)
  values (p_name, p_code, p_workflow_template, p_created_by)
  returning id into v_brand_id;

  insert into user_brand_roles (team_member_id, brand_id, tier)
  values (p_admin_member_id, v_brand_id, '2차');

  return v_brand_id;
end;
$$;
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

프로젝트의 Supabase SQL Editor에 위 파일 내용을 붙여넣고 실행한다. (이 프로젝트에는 자동 마이그레이션 러너가 없다 — `0001_init.sql`/`0002_phase2.sql`과 동일하게 수동 실행.)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0003_phase3.sql
git commit -m "$(cat <<'EOF'
feat: 브랜드+최초 2차 관리자 원자 생성 함수 추가

EOF
)"
```

---

## Task 2: `isGlobalAdmin` 순수 함수 (TDD)

**Files:**
- Modify: `lib/tiers.js`
- Create: `lib/tiers.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// lib/tiers.test.js
import { describe, expect, it } from 'vitest';
import { isGlobalAdmin } from './tiers';

describe('isGlobalAdmin', () => {
  it('isGlobalAdmin이 true인 identity는 true', () => {
    expect(isGlobalAdmin({ isGlobalAdmin: true })).toBe(true);
  });

  it('isGlobalAdmin이 false인 identity는 false', () => {
    expect(isGlobalAdmin({ isGlobalAdmin: false })).toBe(false);
  });

  it('identity가 없으면 false', () => {
    expect(isGlobalAdmin(undefined)).toBe(false);
  });

  it('isGlobalAdmin 필드가 없으면 false', () => {
    expect(isGlobalAdmin({ tier: '2차' })).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/tiers.test.js`
Expected: FAIL — `isGlobalAdmin is not exported` 또는 `undefined is not a function`

- [ ] **Step 3: 최소 구현**

```js
// lib/tiers.js (기존 파일 맨 아래에 추가)
export function isGlobalAdmin(identity) {
  return identity?.isGlobalAdmin === true;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/tiers.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/tiers.js lib/tiers.test.js
git commit -m "$(cat <<'EOF'
feat: 전역관리자 판정용 isGlobalAdmin 추가

EOF
)"
```

---

## Task 3: `checkLastBrandAdmin` 순수 함수 (TDD)

**Files:**
- Create: `lib/checkLastBrandAdmin.js`
- Create: `lib/checkLastBrandAdmin.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// lib/checkLastBrandAdmin.test.js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/checkLastBrandAdmin.test.js`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현**

```js
// lib/checkLastBrandAdmin.js
export function checkLastBrandAdmin({ roles, targetMemberId, brandId }) {
  const targetRole = roles.find(
    (r) => r.brand_id === brandId && r.team_member_id === targetMemberId
  );
  if (!targetRole || targetRole.tier !== '2차') return false;

  const adminCount = roles.filter((r) => r.brand_id === brandId && r.tier === '2차').length;
  return adminCount <= 1;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/checkLastBrandAdmin.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/checkLastBrandAdmin.js lib/checkLastBrandAdmin.test.js
git commit -m "$(cat <<'EOF'
feat: 마지막 2차 관리자 판정용 checkLastBrandAdmin 추가

EOF
)"
```

---

## Task 4: `requireGlobalAdmin` 서버 헬퍼

**Files:**
- Modify: `lib/permissions.js`

- [ ] **Step 1: 함수 추가**

```js
// lib/permissions.js (기존 파일 맨 아래에 추가)
export async function requireGlobalAdmin(memberId) {
  if (!memberId) {
    throw new ApiError(400, 'memberId가 필요합니다.');
  }

  const supabase = getSupabaseAdmin();
  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('id', memberId)
    .single();

  if (error) {
    console.error(error);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active || !member.is_global_admin) {
    throw new ApiError(403, '전역 관리자 권한이 필요합니다.');
  }

  return { isGlobalAdmin: true };
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add lib/permissions.js
git commit -m "$(cat <<'EOF'
feat: 전역관리자 서버 검증용 requireGlobalAdmin 추가

EOF
)"
```

---

## Task 5: API `GET`/`POST /api/brands`

**Files:**
- Create: `app/api/brands/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/brands/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brands')
      .select('id, name, code, workflow_template, is_active')
      .order('name');
    if (error) throw error;
    return Response.json({ brands: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, name, code, workflowTemplate, adminMemberId } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');
    if (!name || !name.trim()) throw new ApiError(400, '이름은 필수입니다.');
    if (!code || !code.trim()) throw new ApiError(400, '코드는 필수입니다.');
    if (!adminMemberId) throw new ApiError(400, '초기 2차 관리자를 선택해주세요.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('create_brand_with_admin', {
      p_name: name.trim(),
      p_code: code.trim(),
      p_workflow_template: workflowTemplate || '표준',
      p_admin_member_id: adminMemberId,
      p_created_by: memberId,
    });
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 사용 중인 브랜드 코드입니다.');
      throw error;
    }
    return Response.json({ brandId: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/api/brands/route.js
git commit -m "$(cat <<'EOF'
feat: 브랜드 목록/생성 API 추가

EOF
)"
```

---

## Task 6: API `PATCH /api/brands/[id]`

**Files:**
- Create: `app/api/brands/[id]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/brands/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, name, code, workflowTemplate, isActive } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code.trim();
    if (workflowTemplate !== undefined) updates.workflow_template = workflowTemplate;
    if (isActive !== undefined) updates.is_active = isActive;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brands')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 사용 중인 브랜드 코드입니다.');
      throw error;
    }
    if (!data) throw new ApiError(404, '브랜드를 찾을 수 없습니다.');
    return Response.json({ brand: data });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add "app/api/brands/[id]/route.js"
git commit -m "$(cat <<'EOF'
feat: 브랜드 수정/활성토글 API 추가

EOF
)"
```

---

## Task 7: API `team-members` 확장 — `GET includeInactive` + `POST`

**Files:**
- Modify: `app/api/team-members/route.js`

- [ ] **Step 1: 기존 파일을 아래 내용으로 교체**

```js
// app/api/team-members/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('team_members')
      .select('id, name, is_active, is_global_admin')
      .order('name');
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ teamMembers: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, name } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');
    if (!name || !name.trim()) throw new ApiError(400, '이름은 필수입니다.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .insert({ name: name.trim(), is_active: true, is_global_admin: false })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ teamMember: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

**주의:** 기존 `GET`은 `is_active`를 select 목록에 넣지 않았다(항상 활성만 반환했으므로 불필요했음). 이제 `includeInactive=true`일 때 비활성 인원도 섞여 반환되므로, 호출부(등록 폼 담당자 드롭다운 등)에서 `is_active`를 신경 쓰지 않아도 되도록 **기존 호출부는 전부 `includeInactive`를 안 붙이던 그대로 유지**된다 — 즉 하위 호환 그대로다.

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/api/team-members/route.js
git commit -m "$(cat <<'EOF'
feat: 팀원 목록에 includeInactive 옵션, 신규 등록 API 추가

EOF
)"
```

---

## Task 8: API `PATCH /api/team-members/[id]`

**Files:**
- Create: `app/api/team-members/[id]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/team-members/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, name, isActive } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (isActive !== undefined) updates.is_active = isActive;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '팀원을 찾을 수 없습니다.');
    return Response.json({ teamMember: data });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add "app/api/team-members/[id]/route.js"
git commit -m "$(cat <<'EOF'
feat: 팀원 정보 수정 API 추가

EOF
)"
```

---

## Task 9: API `GET`/`POST /api/brand-team`

**Files:**
- Create: `app/api/brand-team/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/brand-team/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('id, tier, sub_role, team_member:team_members(id, name, is_active)')
      .eq('brand_id', brandId)
      .order('tier', { ascending: false });
    if (error) throw error;

    const members = (data ?? []).map((row) => ({
      roleId: row.id,
      tier: row.tier,
      subRole: row.sub_role,
      id: row.team_member.id,
      name: row.team_member.name,
      isActive: row.team_member.is_active,
    }));
    return Response.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, brandId, targetMemberId, tier, subRole } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (!targetMemberId) throw new ApiError(400, 'targetMemberId가 필요합니다.');
    if (!['2차', '3차'].includes(tier)) throw new ApiError(400, '유효하지 않은 tier입니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_brand_roles')
      .insert({ team_member_id: targetMemberId, brand_id: brandId, tier, sub_role: subRole || null });
    if (error) {
      if (error.code === '23505') throw new ApiError(400, '이미 이 브랜드에 배치된 팀원입니다.');
      throw error;
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/api/brand-team/route.js
git commit -m "$(cat <<'EOF'
feat: 브랜드 팀원 배치 목록/배치 API 추가

EOF
)"
```

---

## Task 10: API `PATCH`/`DELETE /api/brand-team/[targetMemberId]`

**Files:**
- Create: `app/api/brand-team/[targetMemberId]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/brand-team/[targetMemberId]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { checkLastBrandAdmin } from '@/lib/checkLastBrandAdmin';

const LAST_ADMIN_MESSAGE = '이 브랜드의 마지막 2차 관리자는 해제하거나 강등할 수 없습니다.';

export async function PATCH(request, { params }) {
  try {
    const { targetMemberId } = await params;
    const body = await request.json();
    const { memberId, brandId, tier, subRole } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (tier !== undefined && !['2차', '3차'].includes(tier)) {
      throw new ApiError(400, '유효하지 않은 tier입니다.');
    }

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();

    if (tier === '3차') {
      const { data: roles, error: rolesError } = await supabase
        .from('user_brand_roles')
        .select('team_member_id, brand_id, tier')
        .eq('brand_id', brandId);
      if (rolesError) throw rolesError;
      if (checkLastBrandAdmin({ roles, targetMemberId, brandId })) {
        throw new ApiError(400, LAST_ADMIN_MESSAGE);
      }
    }

    const updates = {};
    if (tier !== undefined) updates.tier = tier;
    if (subRole !== undefined) updates.sub_role = subRole || null;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const { data, error } = await supabase
      .from('user_brand_roles')
      .update(updates)
      .eq('team_member_id', targetMemberId)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '배치 정보를 찾을 수 없습니다.');
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { targetMemberId } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: roles, error: rolesError } = await supabase
      .from('user_brand_roles')
      .select('team_member_id, brand_id, tier')
      .eq('brand_id', brandId);
    if (rolesError) throw rolesError;
    if (checkLastBrandAdmin({ roles, targetMemberId, brandId })) {
      throw new ApiError(400, LAST_ADMIN_MESSAGE);
    }

    const { error } = await supabase
      .from('user_brand_roles')
      .delete()
      .eq('team_member_id', targetMemberId)
      .eq('brand_id', brandId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add "app/api/brand-team/[targetMemberId]/route.js"
git commit -m "$(cat <<'EOF'
feat: 브랜드 팀원 tier/역할 변경·해제 API 추가 (마지막 2차 보호 포함)

EOF
)"
```

---

## Task 11: API `POST /api/brand-categories`

**Files:**
- Modify: `app/api/brand-categories/route.js`

- [ ] **Step 1: 기존 파일을 아래 내용으로 교체**

```js
// app/api/brand-categories/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brand_categories')
      .select('id, category_name, sort_order')
      .eq('brand_id', brandId)
      .order('sort_order');
    if (error) throw error;
    return Response.json({ categories: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { memberId, brandId, categoryName } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (!categoryName || !categoryName.trim()) throw new ApiError(400, '카테고리 이름은 필수입니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: last, error: lastError } = await supabase
      .from('brand_categories')
      .select('sort_order')
      .eq('brand_id', brandId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    const nextSortOrder = (last?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('brand_categories')
      .insert({ brand_id: brandId, category_name: categoryName.trim(), sort_order: nextSortOrder })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ category: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/api/brand-categories/route.js
git commit -m "$(cat <<'EOF'
feat: 카테고리 추가 API 추가

EOF
)"
```

---

## Task 12: API `PATCH`/`DELETE /api/brand-categories/[id]`

**Files:**
- Create: `app/api/brand-categories/[id]/route.js`

- [ ] **Step 1: 라우트 작성**

```js
// app/api/brand-categories/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, categoryName, sortOrder } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const updates = {};
    if (categoryName !== undefined) updates.category_name = categoryName.trim();
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('brand_categories')
      .update(updates)
      .eq('id', id)
      .eq('brand_id', brandId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, '카테고리를 찾을 수 없습니다.');
    return Response.json({ category: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { count, error: usageError } = await supabase
      .from('requirements')
      .select('id', { count: 'exact', head: true })
      .eq('category', id);
    if (usageError) throw usageError;
    if ((count ?? 0) > 0) {
      throw new ApiError(400, '이 카테고리를 사용 중인 요구사항이 있어 삭제할 수 없습니다.');
    }

    const { error } = await supabase
      .from('brand_categories')
      .delete()
      .eq('id', id)
      .eq('brand_id', brandId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add "app/api/brand-categories/[id]/route.js"
git commit -m "$(cat <<'EOF'
feat: 카테고리 수정/삭제 API 추가 (사용중 삭제 차단 포함)

EOF
)"
```

---

## Task 13: `BrandFormDialog` 컴포넌트

**Files:**
- Create: `components/BrandFormDialog.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WORKFLOW_TEMPLATES = ['표준', '커스텀'];

function emptyForm(brand) {
  return {
    name: brand?.name ?? '',
    code: brand?.code ?? '',
    workflowTemplate: brand?.workflow_template ?? '표준',
  };
}

// props: open, onOpenChange, brand(수정 대상, 없으면 생성 모드), teamMembers(전사 활성 직원),
// identity, onSaved()
export function BrandFormDialog({ open, onOpenChange, brand, teamMembers, identity, onSaved }) {
  const isEdit = Boolean(brand);
  const [form, setForm] = useState(emptyForm(brand));
  const [search, setSearch] = useState('');
  const [adminId, setAdminId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(emptyForm(brand));
      setSearch('');
      setAdminId(null);
      setError('');
    }
  }, [open, brand]);

  const searchResults = search
    ? teamMembers.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isEdit && !adminId) {
      setError('초기 2차 관리자를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    const url = isEdit ? `/api/brands/${brand.id}` : '/api/brands';
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isEdit
      ? { memberId: identity.memberId, name: form.name, code: form.code, workflowTemplate: form.workflowTemplate }
      : {
          memberId: identity.memberId,
          name: form.name,
          code: form.code,
          workflowTemplate: form.workflowTemplate,
          adminMemberId: adminId,
        };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '저장에 실패했습니다.');
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  const adminName = teamMembers.find((m) => m.id === adminId)?.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '브랜드 수정' : '새 브랜드'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-name">이름</Label>
            <Input id="brand-name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-code">코드</Label>
            <Input id="brand-code" value={form.code} onChange={(e) => updateField('code', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brand-workflow">워크플로 템플릿</Label>
            <Select
              items={WORKFLOW_TEMPLATES.map((w) => ({ value: w, label: w }))}
              value={form.workflowTemplate}
              onValueChange={(v) => updateField('workflowTemplate', v)}
            >
              <SelectTrigger id="brand-workflow" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_TEMPLATES.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1">
              <Label>초기 2차 관리자</Label>
              <Input placeholder="이름으로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              {adminId && <p className="text-xs text-slate-500">선택됨: {adminName}</p>}
              <ul className="mt-1 flex flex-col gap-1">
                {searchResults.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setAdminId(m.id)}
                      className={`w-full rounded border px-2 py-1.5 text-left ${
                        adminId === m.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                      }`}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add components/BrandFormDialog.jsx
git commit -m "$(cat <<'EOF'
feat: 브랜드 생성/수정 다이얼로그 컴포넌트 추가

EOF
)"
```

---

## Task 14: `TeamMemberFormDialog` 컴포넌트

**Files:**
- Create: `components/TeamMemberFormDialog.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// props: open, onOpenChange, identity, onCreated()
export function TeamMemberFormDialog({ open, onOpenChange, identity, onCreated }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
    }
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/team-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, name }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '등록에 실패했습니다.');
      return;
    }
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 직원 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-name">이름</Label>
            <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add components/TeamMemberFormDialog.jsx
git commit -m "$(cat <<'EOF'
feat: 신규 직원 등록 다이얼로그 컴포넌트 추가

EOF
)"
```

---

## Task 15: `/admin/brands` 페이지

**Files:**
- Create: `app/admin/brands/page.js`

- [ ] **Step 1: 페이지 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { isGlobalAdmin } from '@/lib/tiers';
import { BrandFormDialog } from '@/components/BrandFormDialog';
import { TeamMemberFormDialog } from '@/components/TeamMemberFormDialog';

export default function AdminBrandsPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const globalAdmin = isGlobalAdmin(identity);

  const [brands, setBrands] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

  useEffect(() => {
    if (!globalAdmin) router.replace('/requirements');
  }, [globalAdmin, router]);

  useEffect(() => {
    if (!globalAdmin) return undefined;
    let cancelled = false;
    fetch(`/api/brands?memberId=${identity.memberId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '브랜드 목록을 불러오지 못했습니다.');
        setBrands(d.brands ?? []);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    fetch('/api/team-members?includeInactive=true')
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) setTeamMembers(d.teamMembers ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [globalAdmin, identity.memberId, reloadToken]);

  function refresh() {
    setReloadToken((t) => t + 1);
  }

  async function toggleBrandActive(brand) {
    setActionError('');
    const res = await fetch(`/api/brands/${brand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, isActive: !brand.is_active }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '브랜드 상태 변경 실패');
      return;
    }
    refresh();
  }

  async function toggleMemberActive(member) {
    setActionError('');
    const res = await fetch(`/api/team-members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, isActive: !member.is_active }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '재직여부 변경 실패');
      return;
    }
    refresh();
  }

  if (!globalAdmin) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  const activeTeamMembers = teamMembers.filter((m) => m.is_active);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold text-slate-900">브랜드 관리</h1>
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">브랜드</h2>
          <button
            type="button"
            onClick={() => {
              setEditingBrand(null);
              setBrandDialogOpen(true);
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            + 새 브랜드
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">이름</th>
              <th className="py-2">코드</th>
              <th className="py-2">워크플로</th>
              <th className="py-2">상태</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-2">{b.name}</td>
                <td className="py-2 text-slate-500">{b.code}</td>
                <td className="py-2 text-slate-500">{b.workflow_template}</td>
                <td className="py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      b.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {b.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBrand(b);
                      setBrandDialogOpen(true);
                    }}
                    className="mr-3 text-indigo-600 hover:underline"
                  >
                    수정
                  </button>
                  <button type="button" onClick={() => toggleBrandActive(b)} className="text-slate-500 hover:underline">
                    {b.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">팀원</h2>
          <button
            type="button"
            onClick={() => setMemberDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            + 새 직원
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">이름</th>
              <th className="py-2">재직여부</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {teamMembers.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2">{m.name}</td>
                <td className="py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {m.is_active ? '재직중' : '비활성'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleMemberActive(m)} className="text-slate-500 hover:underline">
                    {m.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <BrandFormDialog
        open={brandDialogOpen}
        onOpenChange={setBrandDialogOpen}
        brand={editingBrand}
        teamMembers={activeTeamMembers}
        identity={identity}
        onSaved={refresh}
      />
      <TeamMemberFormDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        identity={identity}
        onCreated={refresh}
      />
    </div>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add app/admin/brands/page.js
git commit -m "$(cat <<'EOF'
feat: 브랜드 관리 화면(/admin/brands) 추가

EOF
)"
```

---

## Task 16: `BrandTeamAssignDialog` 컴포넌트

**Files:**
- Create: `components/BrandTeamAssignDialog.jsx`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TIERS = ['2차', '3차'];
const SUB_ROLES = ['기획', '개발', '뷰어'];

// props: open, onOpenChange, candidates(미배치 전사 활성 직원), identity, onAssigned()
export function BrandTeamAssignDialog({ open, onOpenChange, candidates, identity, onAssigned }) {
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [tier, setTier] = useState('3차');
  const [subRole, setSubRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setTargetId(null);
      setTier('3차');
      setSubRole(null);
      setError('');
    }
  }, [open]);

  const results = search
    ? candidates.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function handleAssign() {
    if (!targetId) return;
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/brand-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: identity.memberId,
        brandId: identity.brandId,
        targetMemberId: targetId,
        tier,
        subRole,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '배치 실패');
      return;
    }
    onAssigned();
  }

  const targetName = candidates.find((m) => m.id === targetId)?.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>팀원 배치</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label>직원 검색</Label>
            <Input placeholder="이름으로 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="mt-1 flex flex-col gap-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(m.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === m.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {targetId && (
            <>
              <p className="text-slate-500">&lsquo;{targetName}&rsquo; 배치</p>
              <div className="flex flex-col gap-1">
                <Label>tier</Label>
                <Select items={TIERS.map((t) => ({ value: t, label: t }))} value={tier} onValueChange={setTier}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>역할</Label>
                <Select
                  items={SUB_ROLES.map((s) => ({ value: s, label: s }))}
                  value={subRole}
                  onValueChange={setSubRole}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="미지정" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_ROLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!targetId || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? '배치 중...' : '배치'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add components/BrandTeamAssignDialog.jsx
git commit -m "$(cat <<'EOF'
feat: 브랜드 팀원 배치 다이얼로그 컴포넌트 추가

EOF
)"
```

---

## Task 17: `BrandTeamSection` + `CategorySettings` 컴포넌트

**Files:**
- Create: `components/BrandTeamSection.jsx`
- Create: `components/CategorySettings.jsx`

- [ ] **Step 1: `BrandTeamSection` 작성**

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
import { BrandTeamAssignDialog } from '@/components/BrandTeamAssignDialog';

const TIERS = ['2차', '3차'];
const SUB_ROLES = ['기획', '개발', '뷰어'];

// props: members(브랜드 배치 목록), teamMembers(전사 활성 풀), identity, onChanged()
export function BrandTeamSection({ members, teamMembers, identity, onChanged }) {
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  const assignedIds = new Set(members.map((m) => m.id));
  const candidates = teamMembers.filter((m) => !assignedIds.has(m.id));

  async function updateRole(targetMemberId, patch) {
    setError('');
    const res = await fetch(`/api/brand-team/${targetMemberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, ...patch }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '변경 실패');
      return;
    }
    onChanged();
  }

  async function remove(targetMemberId) {
    setError('');
    const res = await fetch(
      `/api/brand-team/${targetMemberId}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '해제 실패');
      return;
    }
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">팀원 배치</h2>
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
        >
          + 배치
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">이름</th>
            <th className="py-2">tier</th>
            <th className="py-2">역할</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="py-2">{m.name}</td>
              <td className="py-2">
                <Select
                  items={TIERS.map((t) => ({ value: t, label: t }))}
                  value={m.tier}
                  onValueChange={(v) => updateRole(m.id, { tier: v })}
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="py-2">
                <Select
                  items={SUB_ROLES.map((s) => ({ value: s, label: s }))}
                  value={m.subRole ?? null}
                  onValueChange={(v) => updateRole(m.id, { subRole: v })}
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue placeholder="미지정" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_ROLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="py-2 text-right">
                <button type="button" onClick={() => remove(m.id)} className="text-rose-600 hover:underline">
                  해제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <BrandTeamAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        candidates={candidates}
        identity={identity}
        onAssigned={() => {
          setAssignOpen(false);
          onChanged();
        }}
      />
    </section>
  );
}
```

- [ ] **Step 2: `CategorySettings` 작성**

```jsx
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

// props: categories(sort_order 오름차순 정렬됨), identity, onChanged()
export function CategorySettings({ categories, identity, onChanged }) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function addCategory(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setError('');
    const res = await fetch('/api/brand-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, categoryName: newName }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '추가 실패');
      return;
    }
    setNewName('');
    onChanged();
  }

  async function removeCategory(id) {
    setError('');
    const res = await fetch(
      `/api/brand-categories/${id}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '삭제 실패');
      return;
    }
    onChanged();
  }

  async function move(index, direction) {
    const other = categories[index + direction];
    const current = categories[index];
    if (!other) return;
    setError('');
    const [resA, resB] = await Promise.all([
      fetch(`/api/brand-categories/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, sortOrder: other.sort_order }),
      }),
      fetch(`/api/brand-categories/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, sortOrder: current.sort_order }),
      }),
    ]);
    if (!resA.ok || !resB.ok) {
      setError('순서 변경 실패');
      return;
    }
    onChanged();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-slate-700">카테고리</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5">
            <span>{c.category_name}</span>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-slate-500 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                disabled={i === categories.length - 1}
                onClick={() => move(i, 1)}
                className="text-slate-500 disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" onClick={() => removeCategory(c.id)} className="text-rose-600 hover:underline">
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={addCategory} className="flex gap-2">
        <Input placeholder="새 카테고리" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
          추가
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 3: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 4: 커밋**

```bash
git add components/BrandTeamSection.jsx components/CategorySettings.jsx
git commit -m "$(cat <<'EOF'
feat: 브랜드 설정 화면용 팀원배치/카테고리 섹션 컴포넌트 추가

EOF
)"
```

---

## Task 18: `/requirements/settings` 페이지 + TopBar 링크

**Files:**
- Create: `app/requirements/settings/page.js`
- Modify: `components/TopBar.jsx`

- [ ] **Step 1: 설정 페이지 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canManage } from '@/lib/tiers';
import { BrandTeamSection } from '@/components/BrandTeamSection';
import { CategorySettings } from '@/components/CategorySettings';

export default function SettingsPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const manage = canManage(identity);

  const [members, setMembers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!manage) router.replace('/requirements');
  }, [manage, router]);

  useEffect(() => {
    if (!manage) return undefined;
    let cancelled = false;
    fetch(`/api/brand-team?memberId=${identity.memberId}&brandId=${identity.brandId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '팀원 배치를 불러오지 못했습니다.');
        setMembers(d.members ?? []);
        setLoadError('');
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) setTeamMembers(d.teamMembers ?? []);
      })
      .catch(() => {});
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) setCategories(d.categories ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [manage, identity.memberId, identity.brandId, reloadToken]);

  function refresh() {
    setReloadToken((t) => t + 1);
  }

  if (!manage) {
    return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
  }
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold text-slate-900">브랜드 설정</h1>
      <BrandTeamSection members={members} teamMembers={teamMembers} identity={identity} onChanged={refresh} />
      <CategorySettings categories={categories} identity={identity} onChanged={refresh} />
    </div>
  );
}
```

- [ ] **Step 2: `TopBar.jsx`에 링크 추가**

`components/TopBar.jsx`의 기존 내용:

```jsx
import { canManage } from '@/lib/tiers';
```

아래처럼 import를 확장한다:

```jsx
import { canManage, isGlobalAdmin } from '@/lib/tiers';
```

`export function TopBar()` 내부, 기존:

```jsx
  const { identity, switchUser } = useIdentity();
  const manage = canManage(identity);
```

아래처럼 확장한다:

```jsx
  const { identity, switchUser } = useIdentity();
  const manage = canManage(identity);
  const globalAdmin = isGlobalAdmin(identity);
```

기존 "보드" 링크 바로 다음(`{manage && ( ... 보드 ... )}` 블록 뒤)에 아래를 추가한다:

```jsx
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
```

수정된 `components/TopBar.jsx` 전체:

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
      </div>
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
    </header>
  );
}
```

- [ ] **Step 3: 린트 확인**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 4: 커밋**

```bash
git add app/requirements/settings/page.js components/TopBar.jsx
git commit -m "$(cat <<'EOF'
feat: 브랜드 설정 화면(/requirements/settings) + TopBar 링크 추가

EOF
)"
```

---

## Task 19: 전체 단위 테스트 재확인 + 브라우저 통합 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 26개 + 이번 단계에서 추가한 `tiers.test.js`(4) + `checkLastBrandAdmin.test.js`(5) = 35개)

- [ ] **Step 2: 린트 + 빌드 확인**

Run: `npm run lint && npm run build`
Expected: lint 0 errors, build 성공

- [ ] **Step 3: 브라우저 시나리오 1 — 브랜드 생성/비활성화**

dev 서버(`npm run dev`) 실행 후 브라우저에서:
1. 1차 계정으로 로그인 → `/admin/brands` 진입 확인(리다이렉트 없음).
2. "+ 새 브랜드" → 이름/코드/워크플로 입력 + 초기 2차 관리자 검색·선택 → 저장 → 목록에 새 브랜드가 나타나는지 확인.
3. 방금 만든 브랜드 "비활성화" 클릭 → 배지가 "비활성"으로 바뀌는지 확인.
4. 진입 화면(`/`)의 브랜드 드롭다운에서 해당 브랜드가 더 이상 보이지 않는지 확인(`GET /api/my-brands`가 `is_active` 필터링).

- [ ] **Step 4: 브라우저 시나리오 2 — 팀원 등록/배치/보호**

1. 1차 계정으로 `/admin/brands`에서 "+ 새 직원" → 이름 입력 → 등록 확인.
2. 2차 계정으로 전환 → `/requirements/settings` 진입 → "+ 배치" → 방금 등록한 직원 검색·선택 → tier(3차)·역할 지정 → 배치 확인(테이블에 반영).
3. 그 직원의 tier를 인라인 드롭다운으로 2차로 올렸다가 다시 3차로 내려서 정상 변경되는지 확인.
4. 카테고리 섹션에서 "+ 카테고리 추가" → 목록에 반영 확인 → 위/아래 버튼으로 순서 변경 확인 → 사용 중이 아닌 카테고리 삭제 확인.
5. 요구사항 목록에서 그 카테고리를 사용하는 요구사항을 하나 등록한 뒤, 그 카테고리 삭제를 시도해 400 에러 배너("사용 중인 요구사항이 있어...")가 뜨는지 확인.
6. 로그인한 2차 계정 본인을 "해제" 시도 → 마지막 2차 관리자라면 400 에러 배너("마지막 2차 관리자는...")가 뜨고 화면이 유지되는지 확인.

- [ ] **Step 5: 브라우저 시나리오 3 — 3차 접근 차단**

1. 3차 계정으로 전환 → 주소창에 직접 `/admin/brands` 입력 → `/requirements`로 리다이렉트되는지 확인.
2. 같은 계정으로 `/requirements/settings` 입력 → `/requirements`로 리다이렉트되는지 확인.

- [ ] **Step 6: 최종 커밋(필요 시)**

브라우저 검증 중 발견된 사소한 수정이 있었다면 그 변경분만 별도로 커밋한다. 문제 없었다면 이 태스크는 커밋 없이 종료.

---

## 스펙 커버리지 자체 점검

- 브랜드 생성/수정/비활성화 → Task 5, 6, 13, 15 ✅
- 팀원 등록/재직여부 수정 → Task 7, 8, 14, 15 ✅
- 브랜드 설정 — 배치/해제/tier·subRole 변경 → Task 9, 10, 16, 17, 18 ✅
- 마지막 2차 관리자 보호 → Task 3, 10, 19(검증) ✅
- 카테고리 추가/수정/삭제(사용중 차단)/순서 변경 → Task 11, 12, 17 ✅
- `isGlobalAdmin`/`requireGlobalAdmin` 신규 권한 원시 → Task 2, 4 ✅
- TopBar 링크(설정/브랜드 관리) → Task 18 ✅
- 브랜드 코드 중복 400 → Task 5(POST), 6(PATCH) ✅
- 1차/2차 전용 라우트 접근 시 403 → `requireGlobalAdmin`/`requireBrandAccess` 재사용으로 전 라우트에서 보장 ✅
- 통합 대시보드, 커스텀 워크플로 실동작, 하드 삭제, 2차의 신규 직원 등록 → 스펙상 범위 제외, 본 계획에도 포함 안 함 ✅
