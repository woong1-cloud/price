# 전사 멀티브랜드 요구사항 관리 웹앱 — 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPAO 등 이랜드리테일 산하 여러 브랜드가 공용으로 쓰는 요구사항 관리 웹앱의 1단계
(스키마 + 브랜드/이름 선택 진입 + 반응형 요구사항 리스트/등록 폼)를 구현한다.

**Architecture:** Next.js 14(App Router) + JavaScript + Tailwind + shadcn/ui. 브라우저는
Supabase에 직접 접속하지 않고, 모든 DB 접근은 Next.js Route Handler(`app/api/*`)가
service role key로 전담한다. 브랜드/tier 권한 체크는 공통 헬퍼
`requireBrandAccess(memberId, brandId, minTier)` 하나로 강제한다. 로그인이 없으므로
이름·브랜드 선택 결과를 `localStorage`에 저장해 세션 동안 유지한다.

**Tech Stack:** Next.js 14, React, Tailwind CSS, shadcn/ui(Radix 기반), Supabase
(`@supabase/supabase-js`), Vitest.

**참고 스펙:** [docs/superpowers/specs/2026-07-21-multibrand-requirements-mgmt-design.md](../specs/2026-07-21-multibrand-requirements-mgmt-design.md)

**실행 위치:** 별도 언급이 없는 한 모든 명령어는 `agent/pj/` 디렉터리에서 실행한다.

---

### Task 1: Next.js 프로젝트 스캐폴딩

**Files:**
- Create: `pj/` 전체 (create-next-app 산출물)

- [ ] **Step 1: create-next-app 실행**

Run:
```bash
npx --yes create-next-app@latest . --js --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-turbopack
```
Expected: 프롬프트 없이 `package.json`, `app/`, `tailwind.config.js`, `.gitignore` 등이 생성됨 (플래그가 버전 차이로 일부 프롬프트를 띄우면, 위 플래그와 동일한 선택으로 응답).

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully` 로 종료 (기본 스캐폴드 빌드 성공)

- [ ] **Step 3: .gitignore에 .env*.local 포함 확인**

`pj/.gitignore` 파일을 열어 `.env*.local` 라인이 있는지 확인한다 (create-next-app 기본값에 포함되어 있음). 없으면 추가한다.

- [ ] **Step 4: Commit**

```bash
git add pj/
git commit -m "chore: Next.js 프로젝트 스캐폴딩"
```

---

### Task 2: shadcn/ui 설치 및 컴포넌트 추가

**Files:**
- Create: `pj/components.json`, `pj/components/ui/*.jsx`, `pj/lib/utils.js`
- Modify: `pj/app/globals.css`, `pj/tailwind.config.js`

- [ ] **Step 1: shadcn 초기화**

Run:
```bash
npx --yes shadcn@latest init -d -y
```
Expected: `components.json` 생성, `app/globals.css`에 CSS 변수 추가, `lib/utils.js` 생성.

- [ ] **Step 2: 필요한 컴포넌트 추가**

Run:
```bash
npx --yes shadcn@latest add button input textarea label checkbox dialog badge -y
```
Expected: `components/ui/button.jsx`, `input.jsx`, `textarea.jsx`, `label.jsx`, `checkbox.jsx`, `dialog.jsx`, `badge.jsx` 생성, 관련 `@radix-ui/*` 패키지 설치.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add pj/
git commit -m "chore: shadcn/ui 설치 및 기본 컴포넌트 추가"
```

---

### Task 3: Supabase 서버 클라이언트 + 환경변수 템플릿

**Files:**
- Create: `pj/lib/supabaseAdmin.js`, `pj/.env.local.example`

- [ ] **Step 1: 패키지 설치**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: 서버 전용 Supabase 클라이언트 작성**

Create `pj/lib/supabaseAdmin.js`:
```js
import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}
```

- [ ] **Step 3: 환경변수 템플릿 작성**

Create `pj/.env.local.example`:
```
# Supabase 프로젝트 설정 > API 에서 확인
# 주의: NEXT_PUBLIC_ 접두어를 붙이지 않는다 (브라우저에 노출되면 안 됨, 서버 전용 키)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 4: Commit**

```bash
git add pj/lib/supabaseAdmin.js pj/.env.local.example pj/package.json pj/package-lock.json
git commit -m "feat: Supabase 서버 클라이언트 및 환경변수 템플릿 추가"
```

---

### Task 4: Supabase 마이그레이션 SQL + 시드 SQL

**Files:**
- Create: `pj/supabase/migrations/0001_init.sql`, `pj/supabase/seed.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `pj/supabase/migrations/0001_init.sql`:
```sql
-- Supabase SQL Editor에 붙여넣어 실행한다.
create extension if not exists "pgcrypto";

create table team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  is_global_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  workflow_template text not null default '표준' check (workflow_template in ('표준','커스텀')),
  is_active boolean not null default true,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

create table user_brand_roles (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id),
  brand_id uuid not null references brands(id),
  tier text not null check (tier in ('2차','3차')),
  sub_role text check (sub_role in ('기획','개발','뷰어')),
  created_at timestamptz not null default now(),
  unique (team_member_id, brand_id)
);

create table brand_categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  category_name text not null,
  sort_order integer not null default 0
);

create table requirements (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  priority text,
  urgency text,
  request_date date not null default current_date,
  requester uuid references team_members(id),
  status text not null default '대기' check (status in ('대기','요청','검토','정책정의','진행중','완료')),
  category uuid references brand_categories(id),
  title text not null,
  as_is text,
  to_be text,
  note text,
  assignee uuid references team_members(id),
  completed_at timestamptz,
  duplicate_count integer not null default 0,
  sprint_tag text,
  is_confidential boolean not null default false,
  screenshot_url text,
  annotated_image_url text,
  annotation_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table change_logs (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id),
  brand_id uuid not null references brands(id),
  changed_by uuid references team_members(id),
  change_type text not null,
  field_name text,
  old_value text,
  new_value text,
  comment text,
  created_at timestamptz not null default now()
);

create table duplicate_links (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id),
  brand_id uuid not null references brands(id),
  linked_requester uuid references team_members(id),
  linked_note text,
  created_at timestamptz not null default now()
);

create table in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id),
  requirement_id uuid references requirements(id),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_requirements_brand_id on requirements (brand_id);
create index idx_user_brand_roles_member on user_brand_roles (team_member_id);
create index idx_user_brand_roles_brand on user_brand_roles (brand_id);
create index idx_brand_categories_brand on brand_categories (brand_id);
create index idx_notifications_member on in_app_notifications (team_member_id);
```

- [ ] **Step 2: 시드 SQL 작성**

Create `pj/supabase/seed.sql`:
```sql
-- 0001_init.sql 실행 후, Supabase SQL Editor에 붙여넣어 실행한다.
insert into team_members (id, name, is_active, is_global_admin) values
 ('11111111-1111-1111-1111-111111111111','김관리', true, true),
 ('22222222-2222-2222-2222-222222222222','박스파오', true, false),
 ('33333333-3333-3333-3333-333333333333','이기획', true, false),
 ('44444444-4444-4444-4444-444444444444','최개발', true, false),
 ('55555555-5555-5555-5555-555555555555','정뉴발', true, false);

insert into brands (id, name, code, workflow_template, is_active, created_by) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','스파오','spao','표준', true, '11111111-1111-1111-1111-111111111111'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','뉴발란스','nb','표준', true, '11111111-1111-1111-1111-111111111111');

insert into user_brand_roles (team_member_id, brand_id, tier, sub_role) values
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2차', null),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','3차','기획'),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','3차','개발'),
 ('55555555-5555-5555-5555-555555555555','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','2차', null);

insert into brand_categories (brand_id, category_name, sort_order) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','UI/UX', 1),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','결제', 2),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','검색', 3),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','UI/UX', 1),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','배송', 2);
```

- [ ] **Step 3: Commit**

```bash
git add pj/supabase/
git commit -m "feat: 초기 스키마 마이그레이션 및 시드 SQL 추가"
```

---

### Task 5: Vitest 설정 + 브랜드 접근 권한 순수 로직 (TDD)

**Files:**
- Create: `pj/vitest.config.js`, `pj/lib/tiers.js`, `pj/lib/checkBrandAccess.js`
- Test: `pj/lib/checkBrandAccess.test.js`
- Modify: `pj/package.json` (test 스크립트)

- [ ] **Step 1: Vitest 설치 및 설정**

Run: `npm install -D vitest`

Create `pj/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

`pj/package.json`의 `scripts`에 추가:
```json
"test": "vitest run"
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `pj/lib/checkBrandAccess.test.js`:
```js
import { describe, expect, it } from 'vitest';
import { checkBrandAccess } from './checkBrandAccess';

describe('checkBrandAccess', () => {
  it('전역 관리자는 모든 브랜드에 접근 가능하다', () => {
    const result = checkBrandAccess({ isGlobalAdmin: true, roles: [], brandId: 'brand-1', minTier: '2차' });
    expect(result).toEqual({ allowed: true, tier: '1차' });
  });

  it('해당 브랜드에 역할이 없으면 거부한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-2', tier: '2차' }],
      brandId: 'brand-1',
      minTier: '3차',
    });
    expect(result).toEqual({ allowed: false, tier: null });
  });

  it('요구되는 tier보다 낮은 등급은 거부한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-1', tier: '3차' }],
      brandId: 'brand-1',
      minTier: '2차',
    });
    expect(result).toEqual({ allowed: false, tier: '3차' });
  });

  it('요구되는 tier 이상이면 허용한다', () => {
    const result = checkBrandAccess({
      isGlobalAdmin: false,
      roles: [{ brand_id: 'brand-1', tier: '2차' }],
      brandId: 'brand-1',
      minTier: '3차',
    });
    expect(result).toEqual({ allowed: true, tier: '2차' });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run lib/checkBrandAccess.test.js`
Expected: FAIL — `Failed to resolve import "./checkBrandAccess"`

- [ ] **Step 4: 구현**

Create `pj/lib/tiers.js`:
```js
export const TIER_RANK = { '3차': 1, '2차': 2, '1차': 3 };
```

Create `pj/lib/checkBrandAccess.js`:
```js
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run lib/checkBrandAccess.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add pj/vitest.config.js pj/lib/tiers.js pj/lib/checkBrandAccess.js pj/lib/checkBrandAccess.test.js pj/package.json pj/package-lock.json
git commit -m "test: 브랜드 접근 권한 판정 로직 추가 (TDD)"
```

---

### Task 6: API 에러 헬퍼 + DB 기반 requireBrandAccess

**Files:**
- Create: `pj/lib/apiError.js`, `pj/lib/permissions.js`

- [ ] **Step 1: 에러 헬퍼 작성**

Create `pj/lib/apiError.js`:
```js
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
}
```

- [ ] **Step 2: requireBrandAccess 작성**

Create `pj/lib/permissions.js`:
```js
import { getSupabaseAdmin } from './supabaseAdmin';
import { checkBrandAccess } from './checkBrandAccess';
import { ApiError } from './apiError';

export async function requireBrandAccess(memberId, brandId, minTier) {
  if (!memberId || !brandId) {
    throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
  }

  const supabase = getSupabaseAdmin();

  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('id', memberId)
    .single();

  if (memberError || !member || !member.is_active) {
    throw new ApiError(403, '유효하지 않은 사용자입니다.');
  }

  const { data: roles, error: rolesError } = await supabase
    .from('user_brand_roles')
    .select('brand_id, tier')
    .eq('team_member_id', memberId);

  if (rolesError) {
    throw new ApiError(500, '권한 조회 중 오류가 발생했습니다.');
  }

  const result = checkBrandAccess({
    isGlobalAdmin: member.is_global_admin,
    roles: roles ?? [],
    brandId,
    minTier,
  });

  if (!result.allowed) {
    throw new ApiError(403, '해당 브랜드에 대한 권한이 없습니다.');
  }

  return { isGlobalAdmin: member.is_global_admin, tier: result.tier };
}
```

이 함수는 실제 Supabase 호출을 포함하므로 단위 테스트 대상에서 제외한다(스펙의 테스트
전략에 따라, DB 연동 경로는 Task 15의 수동 브라우저 검증으로 확인한다).

- [ ] **Step 3: Commit**

```bash
git add pj/lib/apiError.js pj/lib/permissions.js
git commit -m "feat: API 에러 헬퍼와 DB 기반 requireBrandAccess 추가"
```

---

### Task 7: API 라우트 — GET /api/team-members

**Files:**
- Create: `pj/app/api/team-members/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/team-members/route.js`:
```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, is_global_admin')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return Response.json({ teamMembers: data });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pj/app/api/team-members/route.js
git commit -m "feat: GET /api/team-members 라우트 추가"
```

---

### Task 8: API 라우트 — GET /api/my-brands

**Files:**
- Create: `pj/app/api/my-brands/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/my-brands/route.js`:
```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('id, is_active, is_global_admin')
      .eq('id', memberId)
      .single();
    if (memberError || !member || !member.is_active) {
      throw new ApiError(403, '유효하지 않은 사용자입니다.');
    }

    if (member.is_global_admin) {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return Response.json({ brands: data });
    }

    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('brand:brands(id, name, code, is_active)')
      .eq('team_member_id', memberId);
    if (error) throw error;
    const brands = (data ?? [])
      .map((row) => row.brand)
      .filter((brand) => brand && brand.is_active);
    return Response.json({ brands });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pj/app/api/my-brands/route.js
git commit -m "feat: GET /api/my-brands 라우트 추가"
```

---

### Task 9: API 라우트 — GET /api/brand-categories

**Files:**
- Create: `pj/app/api/brand-categories/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/brand-categories/route.js`:
```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
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
```

- [ ] **Step 2: Commit**

```bash
git add pj/app/api/brand-categories/route.js
git commit -m "feat: GET /api/brand-categories 라우트 추가"
```

---

### Task 10: API 라우트 — GET/POST /api/requirements

**Files:**
- Create: `pj/app/api/requirements/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/requirements/route.js`:
```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const memberId = searchParams.get('memberId');
    if (!brandId || !memberId) throw new ApiError(400, 'brandId와 memberId가 필요합니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '3차');
    const canSeeConfidential = isGlobalAdmin || tier === '2차';

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('requirements')
      .select(
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, requester:team_members!requirements_requester_fkey(id, name), category:brand_categories(id, category_name)'
      )
      .eq('brand_id', brandId)
      .order('request_date', { ascending: false });

    if (!canSeeConfidential) {
      query = query.eq('is_confidential', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ requirements: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      memberId,
      brandId,
      priority,
      urgency,
      requestDate,
      requester,
      category,
      title,
      asIs,
      toBe,
      note,
      isConfidential,
    } = body;

    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (!title || !title.trim()) throw new ApiError(400, '제목은 필수입니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requirements')
      .insert({
        brand_id: brandId,
        priority: priority || null,
        urgency: urgency || null,
        request_date: requestDate || new Date().toISOString().slice(0, 10),
        requester: requester || null,
        category: category || null,
        title: title.trim(),
        as_is: asIs || null,
        to_be: toBe || null,
        note: note || null,
        is_confidential: Boolean(isConfidential),
        status: '대기',
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ requirement: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pj/app/api/requirements/route.js
git commit -m "feat: GET/POST /api/requirements 라우트 추가"
```

---

### Task 11: 로그인 대체 identity 저장소 + IdentityProvider

**Files:**
- Create: `pj/lib/identity.js`, `pj/components/IdentityProvider.jsx`, `pj/components/TopBar.jsx`

- [ ] **Step 1: localStorage 헬퍼 작성**

Create `pj/lib/identity.js`:
```js
const STORAGE_KEY = 'requirements-app-identity';

export function loadIdentity() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(identity) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity() {
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 2: IdentityProvider 작성**

Create `pj/components/IdentityProvider.jsx`:
```jsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearIdentity, loadIdentity } from '@/lib/identity';

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  const router = useRouter();
  const [identity, setIdentity] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = loadIdentity();
    if (!stored) {
      router.replace('/');
      return;
    }
    setIdentity(stored);
    setChecked(true);
  }, [router]);

  function switchUser() {
    clearIdentity();
    router.replace('/');
  }

  if (!checked) {
    return <div className="p-6 text-sm text-gray-500">불러오는 중...</div>;
  }

  return (
    <IdentityContext.Provider value={{ identity, switchUser }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity는 IdentityProvider 내부에서만 사용할 수 있습니다.');
  }
  return context;
}
```

- [ ] **Step 3: TopBar 작성**

Create `pj/components/TopBar.jsx`:
```jsx
'use client';

import { useIdentity } from './IdentityProvider';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  return (
    <header className="flex items-center justify-between border-b p-4">
      <div className="text-sm">
        <span className="font-medium">{identity.name}</span>
        {identity.isGlobalAdmin && <span className="ml-2 text-gray-500">전체 관리자</span>}
      </div>
      <button onClick={switchUser} className="text-sm text-gray-500 underline">
        다른 사용자로 전환
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add pj/lib/identity.js pj/components/IdentityProvider.jsx pj/components/TopBar.jsx
git commit -m "feat: 로그인 대체 identity 저장소와 IdentityProvider 추가"
```

---

### Task 12: 진입 화면 (`/`)

**Files:**
- Modify: `pj/app/page.js`

- [ ] **Step 1: 진입 화면 작성**

Replace contents of `pj/app/page.js`:
```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveIdentity } from '@/lib/identity';

export default function EntryPage() {
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((data) => setTeamMembers(data.teamMembers ?? []))
      .catch(() => setError('팀원 목록을 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!memberId) {
      setBrands([]);
      setBrandId('');
      return;
    }
    setLoadingBrands(true);
    fetch(`/api/my-brands?memberId=${memberId}`)
      .then((res) => res.json())
      .then((data) => setBrands(data.brands ?? []))
      .catch(() => setError('브랜드 목록을 불러오지 못했습니다.'))
      .finally(() => setLoadingBrands(false));
  }, [memberId]);

  function handleSubmit(event) {
    event.preventDefault();
    const member = teamMembers.find((m) => m.id === memberId);
    if (!member || !brandId) return;
    saveIdentity({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin: member.is_global_admin,
      brandId,
    });
    router.push('/requirements');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">요구사항 관리</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="member" className="text-sm font-medium">이름</label>
          <select
            id="member"
            className="rounded border p-2"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            required
          >
            <option value="">선택하세요</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="brand" className="text-sm font-medium">브랜드</label>
          <select
            id="brand"
            className="rounded border p-2"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            required
            disabled={!memberId || loadingBrands}
          >
            <option value="">선택하세요</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-black p-2 text-white disabled:opacity-50"
          disabled={!memberId || !brandId}
        >
          입장
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add pj/app/page.js
git commit -m "feat: 이름/브랜드 선택 진입 화면 추가"
```

---

### Task 13: 요구사항 레이아웃 + 목록 페이지

**Files:**
- Create: `pj/app/requirements/layout.js`, `pj/app/requirements/page.js`, `pj/components/RequirementList.jsx`

- [ ] **Step 1: 레이아웃 작성**

Create `pj/app/requirements/layout.js`:
```jsx
import { IdentityProvider } from '@/components/IdentityProvider';
import { TopBar } from '@/components/TopBar';

export default function RequirementsLayout({ children }) {
  return (
    <IdentityProvider>
      <div className="min-h-screen">
        <TopBar />
        <main className="p-4">{children}</main>
      </div>
    </IdentityProvider>
  );
}
```

- [ ] **Step 2: 목록 컴포넌트 작성**

Create `pj/components/RequirementList.jsx`:
```jsx
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT = {
  대기: 'secondary',
  요청: 'secondary',
  검토: 'outline',
  정책정의: 'outline',
  진행중: 'default',
  완료: 'default',
};

export function RequirementList({ requirements }) {
  if (requirements.length === 0) {
    return <p className="text-sm text-gray-500">등록된 요구사항이 없습니다.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded border md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">요청일</th>
              <th className="p-2">상태</th>
              <th className="p-2">카테고리</th>
              <th className="p-2">제목</th>
              <th className="p-2">요청자</th>
              <th className="p-2">우선순위</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((req) => (
              <tr key={req.id} className="border-t">
                <td className="p-2">{req.request_date}</td>
                <td className="p-2">
                  <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge>
                </td>
                <td className="p-2">{req.category?.category_name ?? '-'}</td>
                <td className="p-2">
                  {req.title}
                  {req.is_confidential && <span className="ml-1 text-xs text-red-500">비공개</span>}
                </td>
                <td className="p-2">{req.requester?.name ?? '-'}</td>
                <td className="p-2">{req.priority ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {requirements.map((req) => (
          <div key={req.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <Badge variant={STATUS_VARIANT[req.status] ?? 'secondary'}>{req.status}</Badge>
              <span className="text-xs text-gray-500">{req.request_date}</span>
            </div>
            <p className="mt-2 font-medium">
              {req.title}
              {req.is_confidential && <span className="ml-1 text-xs text-red-500">비공개</span>}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {req.category?.category_name ?? '-'} · {req.requester?.name ?? '-'}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: 목록 페이지 작성**

Create `pj/app/requirements/page.js`:
```jsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIdentity } from '@/components/IdentityProvider';
import { RequirementList } from '@/components/RequirementList';
import { RequirementFormDialog } from '@/components/RequirementFormDialog';

export default function RequirementsPage() {
  const { identity } = useIdentity();
  const [requirements, setRequirements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '요구사항을 불러오지 못했습니다.');
      setRequirements(data.requirements);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [identity.brandId, identity.memberId]);

  useEffect(() => {
    loadRequirements();
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, [identity.brandId, loadRequirements]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">요구사항 목록</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded bg-black px-3 py-2 text-sm text-white"
        >
          + 새 요구사항
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <RequirementList requirements={requirements} />
      )}
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        identity={identity}
        onCreated={loadRequirements}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add pj/app/requirements/layout.js pj/app/requirements/page.js pj/components/RequirementList.jsx
git commit -m "feat: 요구사항 목록 페이지 및 레이아웃 추가"
```

(참고: `RequirementFormDialog`는 Task 14에서 작성하므로, 이 커밋 시점에는 아직 참조 오류가
날 수 있다. Task 14까지 완료한 뒤 `npm run build`로 함께 확인한다.)

---

### Task 14: 요구사항 등록 폼 (Dialog)

**Files:**
- Create: `pj/components/RequirementFormDialog.jsx`

- [ ] **Step 1: 등록 폼 작성**

Create `pj/components/RequirementFormDialog.jsx`:
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
import { Checkbox } from '@/components/ui/checkbox';

function emptyForm() {
  return {
    title: '',
    priority: '',
    urgency: '',
    requestDate: new Date().toISOString().slice(0, 10),
    category: '',
    asIs: '',
    toBe: '',
    note: '',
    isConfidential: false,
  };
}

export function RequirementFormDialog({ open, onOpenChange, categories, identity, onCreated }) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: identity.memberId,
          brandId: identity.brandId,
          requester: identity.memberId,
          title: form.title,
          priority: form.priority || null,
          urgency: form.urgency || null,
          requestDate: form.requestDate,
          category: form.category || null,
          asIs: form.asIs,
          toBe: form.toBe,
          note: form.note,
          isConfidential: form.isConfidential,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      setForm(emptyForm());
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 요구사항 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-1">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="priority">우선순위</Label>
              <Input
                id="priority"
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                placeholder="상/중/하"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="urgency">긴급도</Label>
              <Input
                id="urgency"
                value={form.urgency}
                onChange={(e) => updateField('urgency', e.target.value)}
                placeholder="상/중/하"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="requestDate">요청일</Label>
            <Input
              id="requestDate"
              type="date"
              value={form.requestDate}
              onChange={(e) => updateField('requestDate', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="category">카테고리</Label>
            <select
              id="category"
              className="rounded border p-2 text-sm"
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
            >
              <option value="">선택 안 함</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="asIs">As-Is</Label>
            <Textarea id="asIs" value={form.asIs} onChange={(e) => updateField('asIs', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="toBe">To-Be</Label>
            <Textarea id="toBe" value={form.toBe} onChange={(e) => updateField('toBe', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="note">비고</Label>
            <Textarea id="note" value={form.note} onChange={(e) => updateField('note', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isConfidential"
              checked={form.isConfidential}
              onCheckedChange={(checked) => updateField('isConfidential', Boolean(checked))}
            />
            <Label htmlFor="isConfidential">비공개 요구사항 (2차 이상만 조회 가능)</Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully` (Task 13에서 남겨둔 참조 오류 해소 확인)

- [ ] **Step 3: Commit**

```bash
git add pj/components/RequirementFormDialog.jsx
git commit -m "feat: 요구사항 등록 폼 Dialog 추가"
```

---

### Task 15: 수동 브라우저 검증

> ⚠️ 이 태스크는 실제 Supabase 프로젝트(URL, SERVICE ROLE KEY)가 필요하다. 실행하는
> 에이전트가 자격증명을 갖고 있지 않다면, 진행하기 전에 사용자에게 요청한다.

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 환경변수 설정**

`pj/.env.local`을 생성하고 `.env.local.example`의 형식대로 실제 Supabase `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` 값을 채운다.

- [ ] **Step 2: 마이그레이션/시드 적용**

Supabase 대시보드의 SQL Editor에서 `pj/supabase/migrations/0001_init.sql` 내용을 실행한 뒤,
`pj/supabase/seed.sql` 내용을 실행한다.

- [ ] **Step 3: 단위 테스트 실행**

Run: `npx vitest run`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 개발 서버 실행**

Run: `npm run dev`
Expected: `http://localhost:3000` 에서 서비스 기동

- [ ] **Step 5: 진입 → 목록 흐름 확인**

브라우저에서 `http://localhost:3000` 접속 → 이름을 "박스파오"(2차, 스파오)로 선택 →
브랜드 드롭다운에 "스파오"만 보이는지 확인 → 선택 후 `/requirements`로 이동해 빈 목록이
보이는지 확인.

- [ ] **Step 6: 등록 흐름 확인**

"+ 새 요구사항" 클릭 → 제목/카테고리 등을 입력해 등록 → 목록에 새 행이 즉시 반영되는지
확인 (데스크톱 너비에서 테이블, 브라우저 창을 모바일 너비로 줄였을 때 카드형으로
전환되는지 확인).

- [ ] **Step 7: 비공개 필터링 확인**

같은 요구사항을 "비공개" 체크로 하나 더 등록 → "이기획"(3차, 스파오)으로 재진입해 목록에서
해당 항목이 보이지 않는지 확인 → "박스파오"(2차)나 "김관리"(1차, 전체 관리자)로 재진입해
보이는지 확인.

- [ ] **Step 8: 권한 경계 확인**

"정정뉴발"(뉴발란스 2차)로 진입 시 브랜드 드롭다운에 "뉴발란스"만 보이는지, "김관리"(1차)
로 진입 시 "스파오"/"뉴발란스"가 모두 보이는지 확인.

- [ ] **Step 9: 최종 커밋**

검증 중 사소한 버그를 수정했다면 각 수정 건별로 커밋한다. 문제가 없다면 이 태스크는 커밋
없이 종료한다.

---

## Self-Review 결과

- **스펙 커버리지**: 진입 화면(Task 12), 브랜드/이름 선택 세션 유지(Task 11), 리스트/등록
  폼 반응형(Task 13-14), `is_confidential` 필터링(Task 10, 15), tier 기반 API 체크(Task 5-6),
  전체 8개 테이블 스키마(Task 4) — 1단계 스펙 전 항목에 대응하는 태스크 존재.
- **범위 제외 항목**: 상태 변경, Triage, change_logs 기록, 브랜드 관리 UI, 통합 대시보드,
  알림, 이미지 업로드, 엑셀 내보내기는 스펙에 따라 이번 계획에서 의도적으로 제외 (2~6단계).
- **placeholder 없음**: 모든 코드 스텝에 완성된 코드 포함, "TODO"/"이후 구현" 표현 없음.
- **타입/시그니처 일관성**: `checkBrandAccess({isGlobalAdmin, roles, brandId, minTier})` 시그니처가
  Task 5(정의)와 Task 6(`requireBrandAccess` 내부 호출)에서 동일. `getSupabaseAdmin()` 함수명이
  Task 3(정의)과 Task 7~10(사용) 전체에서 동일. `identity = {memberId, name, isGlobalAdmin, brandId}`
  형태가 Task 11(저장)·12(생성)·13~14(소비) 전체에서 일관됨.
