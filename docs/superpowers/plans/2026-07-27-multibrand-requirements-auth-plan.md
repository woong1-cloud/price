# 로그인/인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이름 드롭다운만으로 들어가지던 무인증 진입을 Supabase Auth 기반 이메일/비밀번호 로그인으로 교체하고, 모든 API가 요청 body/query의 `memberId`가 아니라 서버가 검증한 로그인 세션에서 신원을 가져오도록 바꾼다.

**Architecture:** Supabase Auth(`auth.users`)를 `team_members.auth_user_id`로 연결한다. 서버 쪽 `lib/auth.js`의 `getSessionMember()`가 요청 쿠키의 세션을 검증해 진짜 `memberId`/`isGlobalAdmin`을 돌려주고, `lib/permissions.js`의 `requireBrandAccess`/`requireGlobalAdmin`이 더 이상 `memberId` 인자를 받지 않고 이 값을 내부적으로 사용한다. 클라이언트는 로그인 후 `/api/me`+`/api/my-brands`로 받은 값을 `localStorage`에 표시용으로만 캐시한다(권한 판정 근거 아님). `middleware.js`가 세션 갱신과 미인증 접근 차단을 담당한다.

**Tech Stack:** Next.js 16(App Router, JS) + React 19 + Tailwind v4 + Supabase(Postgres, Auth, `@supabase/ssr`) + Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-07-27-multibrand-requirements-auth-design.md`

**테스트 전략:** 이 작업은 대부분 세션/쿠키/외부 인증 서비스에 위임되는 로직이라 순수 함수로 뽑아낼 부분이 거의 없다. `npm run lint`로 구문을 확인하고, 마지막 태스크에서 수동 부트스트랩 후 브라우저로 전체 로그인 플로우를 검증한다.

**작업 위치:** 모든 파일 경로는 `pj/` 기준 상대 경로다.

---

## 파일 구조

**신규 생성**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0005_auth.sql` | `team_members`에 `auth_user_id`/`must_change_password` 추가 |
| `lib/supabaseBrowser.js` | 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트 |
| `lib/supabaseServer.js` | Route Handler용 Supabase 클라이언트(쿠키 기반) |
| `lib/auth.js` | `getSessionMember()` — 세션 쿠키 → 실제 memberId/isGlobalAdmin 조회 |
| `middleware.js` | 세션 갱신 + 미인증 접근 시 `/login` 리다이렉트 |
| `app/api/me/route.js` | 현재 세션의 memberId/name/isGlobalAdmin/mustChangePassword 반환 |
| `app/api/me/password-changed/route.js` | 비밀번호 변경 완료 후 `must_change_password`를 false로 |
| `app/api/admin/create-account/route.js` | 전체관리자가 팀원 계정(이메일+임시비번) 생성 |
| `app/api/admin/reset-password/route.js` | 전체관리자가 팀원 비밀번호 재설정 |
| `app/login/page.js` | 로그인 화면(기존 `/` 대체) + 브랜드 선택 단계 |
| `app/change-password/page.js` | 강제/자발적 비밀번호 변경 화면 |
| `components/AccountCredentialDialog.jsx` | 계정 생성/비밀번호 재설정 다이얼로그(모드 겸용) |

**수정**

| 파일 | 변경 내용 |
|---|---|
| `package.json` | `@supabase/ssr` 의존성 추가 |
| `.env.local.example` | `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가 |
| `lib/permissions.js` | `requireBrandAccess(brandId, minTier)`/`requireGlobalAdmin()`로 시그니처 변경, `memberId` 반환값에 포함 |
| `app/api/my-brands/route.js` | 세션 기반으로 리팩터링 |
| `app/api/team-members/route.js` | GET에 인증 추가(기존엔 없었음), 세션 기반으로 리팩터링, `auth_user_id` 함께 조회 |
| `app/api/requirements/route.js`, `.../[id]/route.js`, `.../[id]/status/route.js`, `.../[id]/assignee/route.js`, `.../[id]/merge/route.js`, `.../[id]/similar/route.js`, `.../[id]/images/route.js`, `.../[id]/images/[imageId]/route.js` | `requireBrandAccess` 호출부에서 body/query의 `memberId` 제거, 반환값의 `memberId` 사용 |
| `app/api/brands/route.js`, `.../[id]/route.js`, `app/api/brand-team/route.js`, `.../[targetMemberId]/route.js`, `app/api/brand-categories/route.js`, `.../[id]/route.js`, `app/api/dashboard/route.js`, `app/api/team-members/[id]/route.js` | `requireGlobalAdmin`/`requireBrandAccess` 호출부에서 `memberId` 제거 |
| `components/BrandFormDialog.jsx`, `BrandTeamAssignDialog.jsx`, `BrandTeamSection.jsx`, `CategorySettings.jsx`, `KanbanBoard.jsx`, `MergeDialog.jsx`, `RequirementDetail.jsx`, `RequirementEditForm.jsx`, `RequirementFormDialog.jsx`, `TeamMemberFormDialog.jsx`, `app/admin/brands/page.js`, `app/admin/dashboard/page.js`, `app/requirements/page.js`, `app/requirements/settings/page.js` | fetch 호출부에서 `memberId` 전송 제거 |
| `app/page.js` | 기존 드롭다운 폼 삭제, 최소 리다이렉트 스텁으로 교체 |
| `components/IdentityProvider.jsx` | 리다이렉트 대상 `/`→`/login`, `switchUser`→`logout`(Supabase signOut 연동) |
| `components/TopBar.jsx` | "다른 사용자로 전환" → "로그아웃" |
| `app/admin/brands/page.js` | 팀원 테이블에 계정 생성/비밀번호 재설정 버튼 + 다이얼로그 연결 |

---

## Task 1: 마이그레이션 0005 — `auth_user_id`/`must_change_password` 추가

**Files:**
- Create: `supabase/migrations/0005_auth.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql ~ 0004_permission_redesign.sql 실행 이후)

alter table team_members add column auth_user_id uuid unique references auth.users(id) on delete set null;
alter table team_members add column must_change_password boolean not null default true;

-- 최초 부트스트랩(수동, 1회만):
-- 1) Supabase 대시보드 Authentication 화면에서 최초 전체관리자 계정을 이메일+비밀번호로 직접 생성한다.
-- 2) 아래 SQL로 team_members와 연결한다(따옴표 안을 실제 값으로 교체):
--    update team_members
--    set auth_user_id = '<위에서 만든 auth.users의 id>', must_change_password = true
--    where id = '<최초 전체관리자의 team_members.id>';
-- 이후부터는 그 계정으로 로그인해 /admin/brands 화면에서 나머지 팀원 계정을 생성할 수 있다.
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

이 프로젝트는 자동 마이그레이션 러너가 없다 — 위 내용을 Supabase SQL Editor에 붙여넣어 직접 실행한다. 실행 직후에는 기존 팀원 전원이 `auth_user_id`가 비어 있어 아무도 로그인할 수 없는 상태다 — 파일 하단 주석의 부트스트랩 절차를 따로 수행해야 한다(이 작업은 Task 20 최종 검증에서 함께 진행).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0005_auth.sql
git commit -m "$(cat <<'EOF'
feat: team_members에 auth_user_id/must_change_password 컬럼 추가

EOF
)"
```

---

## Task 2: 패키지 설치 + 환경변수 추가

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`

- [ ] **Step 1: `@supabase/ssr` 설치**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: `.env.local.example`에 공개 키 추가**

현재 파일:
```
# Supabase 프로젝트 설정 > API 에서 확인
# 주의: NEXT_PUBLIC_ 접두어를 붙이지 않는다 (브라우저에 노출되면 안 됨, 서버 전용 키)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
아래 두 줄을 파일 끝에 추가:
```
# 브라우저에 노출되는 공개 키 — 로그인 등 클라이언트 인증에 사용한다.
# anon key는 원래 공개되어도 되는 키다(RLS로 보호되는 게 원칙이지만, 이 앱은
# 클라이언트에서 Supabase 테이블을 직접 조회하지 않고 로그인/세션에만 쓴다).
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: 실제 `.env.local`에도 같은 값 추가**

Supabase 대시보드 Project Settings > API에서 anon public 키를 복사해 `.env.local`(gitignore됨, 커밋 안 함)에 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`로 추가한다. `SUPABASE_URL`과 동일한 프로젝트 URL을 쓴다.

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "$(cat <<'EOF'
chore: @supabase/ssr 설치 + 공개 Supabase 환경변수 추가

EOF
)"
```

---

## Task 3: `lib/supabaseBrowser.js` — 브라우저용 Supabase 클라이언트

**Files:**
- Create: `lib/supabaseBrowser.js`

- [ ] **Step 1: 파일 작성**

```js
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add lib/supabaseBrowser.js
git commit -m "$(cat <<'EOF'
feat: 브라우저용 Supabase 클라이언트 추가

EOF
)"
```

---

## Task 4: `lib/supabaseServer.js` — Route Handler용 Supabase 클라이언트

**Files:**
- Create: `lib/supabaseServer.js`

- [ ] **Step 1: 파일 작성**

```js
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component에서 호출된 경우 쓰기가 막혀 있다 — middleware.js가
            // 매 요청마다 세션을 갱신하므로 여기서 실패해도 무시해도 된다.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add lib/supabaseServer.js
git commit -m "$(cat <<'EOF'
feat: Route Handler용 Supabase 서버 클라이언트 추가

EOF
)"
```

---

## Task 5: `lib/auth.js` — `getSessionMember()`

**Files:**
- Create: `lib/auth.js`

- [ ] **Step 1: 파일 작성**

```js
import 'server-only';
import { createClient } from './supabaseServer';
import { getSupabaseAdmin } from './supabaseAdmin';
import { ApiError } from './apiError';

// 요청 쿠키의 Supabase 세션을 서버에 재검증하고(auth.getUser()), team_members에서
// 실제 memberId/isGlobalAdmin을 조회한다. Route Handler 안에서만 호출 가능하다
// (next/headers의 cookies()에 의존).
export async function getSessionMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  const admin = getSupabaseAdmin();
  const { data: member, error } = await admin
    .from('team_members')
    .select('id, is_active, is_global_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
  }
  if (!member || !member.is_active) {
    throw new ApiError(403, '유효하지 않은 사용자입니다.');
  }

  return { memberId: member.id, isGlobalAdmin: member.is_global_admin };
}
```

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add lib/auth.js
git commit -m "$(cat <<'EOF'
feat: 세션에서 실제 memberId를 조회하는 getSessionMember 추가

EOF
)"
```

---

## Task 6: `lib/permissions.js` 리팩터링 — 세션 기반으로

**Files:**
- Modify: `lib/permissions.js`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```js
import { getSupabaseAdmin } from './supabaseAdmin';
import { checkBrandAccess } from './checkBrandAccess';
import { ApiError } from './apiError';
import { getSessionMember } from './auth';

export async function requireBrandAccess(brandId, minTier) {
  if (!brandId) {
    throw new ApiError(400, 'brandId가 필요합니다.');
  }

  const { memberId, isGlobalAdmin } = await getSessionMember();

  const supabase = getSupabaseAdmin();
  const { data: roles, error: rolesError } = await supabase
    .from('user_brand_roles')
    .select('brand_id, tier')
    .eq('team_member_id', memberId);

  if (rolesError) {
    console.error(rolesError);
    throw new ApiError(500, '권한 조회 중 오류가 발생했습니다.');
  }

  const result = checkBrandAccess({
    isGlobalAdmin,
    roles: roles ?? [],
    brandId,
    minTier,
  });

  if (!result.allowed) {
    throw new ApiError(403, '해당 브랜드에 대한 권한이 없습니다.');
  }

  return { memberId, isGlobalAdmin, tier: result.tier };
}

export async function requireGlobalAdmin() {
  const { memberId, isGlobalAdmin } = await getSessionMember();
  if (!isGlobalAdmin) {
    throw new ApiError(403, '전역 관리자 권한이 필요합니다.');
  }
  return { memberId, isGlobalAdmin: true };
}
```

이전 버전과의 차이: 두 함수 모두 `memberId` 인자를 받지 않고 `getSessionMember()`로 세션에서 직접 가져온다. `requireBrandAccess`의 반환값에 `memberId`가 추가됐다(호출부에서 body의 `memberId` 대신 이 값을 써야 하는 곳들이 있다 — Task 11/12에서 처리).

- [ ] **Step 2: 린트 확인**

```bash
npm run lint
```

이 시점에는 아직 호출부(API 라우트)들이 옛 시그니처(`requireBrandAccess(memberId, brandId, minTier)`)로 호출하고 있어 타입상 문제는 없지만(JS라 인자 개수가 안 맞아도 에러는 안 남) 런타임에 `brandId`/`minTier` 자리에 잘못된 값이 들어가 있는 깨진 상태다. Task 11/12에서 호출부를 전부 고치기 전까지는 API가 정상 동작하지 않는다 — 이건 이후 태스크 완료 시 해소된다는 전제로 계속 진행한다(이전 권한 재설계 작업 때도 같은 패턴으로 진행했었다).

- [ ] **Step 3: 커밋**

```bash
git add lib/permissions.js
git commit -m "$(cat <<'EOF'
feat: requireBrandAccess/requireGlobalAdmin을 세션 기반으로 리팩터링

EOF
)"
```

---

## Task 7: `middleware.js` — 세션 갱신 + 보호 라우트 리다이렉트

**Files:**
- Create: `middleware.js`

- [ ] **Step 1: 파일 작성**

```js
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/change-password'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
```

`/api/*`는 matcher에서 제외되어 있다 — API 라우트의 인증 실패는 미들웨어 리다이렉트가 아니라 `requireBrandAccess`/`requireGlobalAdmin`이 던지는 401/403 JSON 응답으로 처리한다(브라우저 리다이렉트가 아니라 `fetch` 호출자가 에러로 받아야 하므로).

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add middleware.js
git commit -m "$(cat <<'EOF'
feat: 세션 갱신 및 미인증 접근 차단 미들웨어 추가

EOF
)"
```

---

## Task 8: `/api/me`, `/api/me/password-changed`

**Files:**
- Create: `app/api/me/route.js`
- Create: `app/api/me/password-changed/route.js`

- [ ] **Step 1: `app/api/me/route.js` 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const { memberId, isGlobalAdmin } = await getSessionMember();

    const supabase = getSupabaseAdmin();
    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, name, must_change_password')
      .eq('id', memberId)
      .single();
    if (error) throw error;

    return Response.json({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin,
      mustChangePassword: member.must_change_password,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: `app/api/me/password-changed/route.js` 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function POST() {
  try {
    const { memberId } = await getSessionMember();

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('team_members')
      .update({ must_change_password: false })
      .eq('id', memberId);
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/me
git commit -m "$(cat <<'EOF'
feat: 세션 조회(/api/me) + 비밀번호 변경 완료 처리 API 추가

EOF
)"
```

---

## Task 9: `GET /api/my-brands` 세션 기반으로 리팩터링

**Files:**
- Modify: `app/api/my-brands/route.js`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionMember } from '@/lib/auth';
import { errorResponse } from '@/lib/apiError';

export async function GET() {
  try {
    const { memberId, isGlobalAdmin } = await getSessionMember();
    const supabase = getSupabaseAdmin();

    if (isGlobalAdmin) {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      const brands = (data ?? []).map((b) => ({ ...b, tier: '1차' }));
      return Response.json({ brands });
    }

    const { data, error } = await supabase
      .from('user_brand_roles')
      .select('tier, brand:brands(id, name, code, is_active)')
      .eq('team_member_id', memberId);
    if (error) throw error;
    const brands = (data ?? [])
      .filter((row) => row.brand && row.brand.is_active)
      .map((row) => ({
        id: row.brand.id,
        name: row.brand.name,
        code: row.brand.code,
        tier: row.tier,
      }));
    return Response.json({ brands });
  } catch (error) {
    return errorResponse(error);
  }
}
```

`memberId` 쿼리 파라미터가 완전히 사라졌다 — 로그인 화면이 이 엔드포인트로 "내 브랜드 목록"을 가져오는 게 로그인 플로우의 핵심이라, 세션 기반으로 바뀌는 게 이번 작업에서 가장 먼저 실제로 쓰이는 지점이다.

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/my-brands/route.js
git commit -m "$(cat <<'EOF'
feat: GET /api/my-brands를 세션 기반으로 리팩터링

EOF
)"
```

---

## Task 10: `GET/POST /api/team-members` 세션 기반 + 인증 추가

**Files:**
- Modify: `app/api/team-members/route.js`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```js
// app/api/team-members/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function GET(request) {
  try {
    await requireGlobalAdmin();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('team_members')
      .select('id, name, is_active, is_global_admin, auth_user_id')
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
    const { name } = body;
    if (!name || !name.trim()) throw new ApiError(400, '이름은 필수입니다.');

    await requireGlobalAdmin();

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

바뀐 점: (1) GET에 `requireGlobalAdmin()` 인증이 새로 생겼다(기존엔 전혀 없었음). (2) `select`에 `auth_user_id`를 추가해서 `/admin/brands` 화면이 "계정 생성" 버튼을 보여줄지 "비밀번호 재설정" 버튼을 보여줄지 판단할 수 있게 했다. (3) POST가 더 이상 body의 `memberId`를 읽지 않는다.

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/team-members/route.js
git commit -m "$(cat <<'EOF'
feat: GET/POST /api/team-members를 세션 기반으로 리팩터링 (GET 인증 신규 추가)

EOF
)"
```

---

## Task 11: 요구사항 관련 API 라우트 일괄 리팩터링

**Files:**
- Modify: `app/api/requirements/route.js`
- Modify: `app/api/requirements/[id]/route.js`
- Modify: `app/api/requirements/[id]/status/route.js`
- Modify: `app/api/requirements/[id]/assignee/route.js`
- Modify: `app/api/requirements/[id]/merge/route.js`
- Modify: `app/api/requirements/[id]/similar/route.js`
- Modify: `app/api/requirements/[id]/images/route.js`
- Modify: `app/api/requirements/[id]/images/[imageId]/route.js`

각 파일에서 "body/query에서 `memberId` 읽기 + 빈 값 체크"를 지우고, `requireBrandAccess(brandId, minTier)` 호출로 바꾼다. 이후 코드에서 `memberId`를 쓰던 자리는 `requireBrandAccess`가 반환한 `memberId`로 바꾼다.

- [ ] **Step 1: `app/api/requirements/route.js`**

`GET` 함수 안, 기존:
```js
    const brandId = searchParams.get('brandId');
    const memberId = searchParams.get('memberId');
    if (!brandId || !memberId) throw new ApiError(400, 'brandId와 memberId가 필요합니다.');

    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '4차');
```
을 아래로 교체:
```js
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');

    const { tier, isGlobalAdmin } = await requireBrandAccess(brandId, '4차');
```

`POST` 함수 안, 기존:
```js
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

    const { isGlobalAdmin, tier } = await requireBrandAccess(memberId, brandId, '4차');
    const canSetConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requirements')
      .insert({
        brand_id: brandId,
        priority: priority || null,
        urgency: urgency || null,
        request_date: requestDate || new Date().toISOString().slice(0, 10),
        requester: requester || null,
```
을 아래로 교체:
```js
    const body = await request.json();
    const {
      brandId,
      priority,
      urgency,
      requestDate,
      category,
      title,
      asIs,
      toBe,
      note,
      isConfidential,
    } = body;

    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (!title || !title.trim()) throw new ApiError(400, '제목은 필수입니다.');

    const { memberId, isGlobalAdmin, tier } = await requireBrandAccess(brandId, '4차');
    const canSetConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requirements')
      .insert({
        brand_id: brandId,
        priority: priority || null,
        urgency: urgency || null,
        request_date: requestDate || new Date().toISOString().slice(0, 10),
        requester: memberId,
```

`requester` 필드는 더 이상 body에서 받지 않고 세션에서 검증된 `memberId`로 고정한다 — 이전엔 body의 `requester`를 그대로 신뢰해서, 원한다면 다른 사람 명의로 요구사항을 등록할 수 있는 구멍이 있었다. 이번 리팩터링과 같은 종류의 문제라 같이 고친다.

- [ ] **Step 2: `app/api/requirements/[id]/route.js`**

`GET` 함수 안, 기존:
```js
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');
```
을 삭제(이 두 줄만 제거, 나머지는 그대로 둔다).

기존:
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, requirement.brand_id, '4차');
```
을:
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(requirement.brand_id, '4차');
```

`PATCH` 함수 안, 기존:
```js
    const { memberId, brandId, title, priority, urgency, category, asIs, toBe, note, isConfidential } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '4차');
```
을:
```js
    const { brandId, title, priority, urgency, category, asIs, toBe, note, isConfidential } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const { memberId, tier, isGlobalAdmin } = await requireBrandAccess(brandId, '4차');
```

이후 `current.requester === memberId` 비교와 `changed_by: memberId`는 그대로 둔다(이제 `memberId`가 세션에서 온 값이라 안전하다).

- [ ] **Step 3: `app/api/requirements/[id]/status/route.js`**

기존:
```js
    const { memberId, brandId, status } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
```
을:
```js
    const { brandId, status } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
```

기존:
```js
    await requireBrandAccess(memberId, brandId, '3차');
```
을:
```js
    const { memberId } = await requireBrandAccess(brandId, '3차');
```

`changed_by: memberId`를 쓰는 `change_logs` insert 부분은 그대로 둔다.

- [ ] **Step 4: `app/api/requirements/[id]/assignee/route.js`**

기존:
```js
    const { memberId, brandId, assignee } = body; // assignee: team_member id 또는 null
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '3차');
```
을:
```js
    const { brandId, assignee } = body; // assignee: team_member id 또는 null
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '3차');
```

- [ ] **Step 5: `app/api/requirements/[id]/merge/route.js`**

기존:
```js
    const { memberId, brandId, targetId } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '3차');
```
을:
```js
    const { brandId, targetId } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const { memberId } = await requireBrandAccess(brandId, '3차');
```

`p_member: memberId`를 쓰는 부분은 그대로 둔다.

- [ ] **Step 6: `app/api/requirements/[id]/similar/route.js`**

기존:
```js
    const memberId = searchParams.get('memberId');
    ...
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '3차');
```
을:
```js
    ...
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '3차');
```
(`searchParams.get('memberId')` 줄 자체를 삭제한다.)

- [ ] **Step 7: `app/api/requirements/[id]/images/route.js`**

기존:
```js
    const memberId = form.get('memberId');
    const brandId = form.get('brandId');
    const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size !== undefined);
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (files.length === 0) throw new ApiError(400, '업로드할 이미지가 없습니다.');

    await requireBrandAccess(memberId, brandId, '4차');
```
을:
```js
    const brandId = form.get('brandId');
    const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size !== undefined);
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
    if (files.length === 0) throw new ApiError(400, '업로드할 이미지가 없습니다.');

    const { memberId } = await requireBrandAccess(brandId, '4차');
```

`uploaded_by: memberId`를 쓰는 insert는 그대로 둔다.

- [ ] **Step 8: `app/api/requirements/[id]/images/[imageId]/route.js`**

기존:
```js
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '4차');
```
을:
```js
    const brandId = searchParams.get('brandId');
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '4차');
```

- [ ] **Step 9: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/requirements
git commit -m "$(cat <<'EOF'
feat: 요구사항 관련 API가 세션 기반 신원을 쓰도록 리팩터링

EOF
)"
```

---

## Task 12: 브랜드/팀원/카테고리 관리 API 라우트 일괄 리팩터링

**Files:**
- Modify: `app/api/brands/route.js`
- Modify: `app/api/brands/[id]/route.js`
- Modify: `app/api/brand-team/route.js`
- Modify: `app/api/brand-team/[targetMemberId]/route.js`
- Modify: `app/api/brand-categories/route.js`
- Modify: `app/api/brand-categories/[id]/route.js`
- Modify: `app/api/dashboard/route.js`
- Modify: `app/api/team-members/[id]/route.js`

- [ ] **Step 1: `app/api/brands/route.js`**

`GET` 함수 안, 기존:
```js
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);
```
을:
```js
    await requireGlobalAdmin();
```

`POST` 함수 안, 기존:
```js
    const { memberId, name, code, workflowTemplate, adminMemberId } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');
```
을:
```js
    const { name, code, workflowTemplate, adminMemberId } = body;
```
기존:
```js
    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('create_brand_with_admin', {
      p_name: name.trim(),
      p_code: code.trim(),
      p_workflow_template: workflowTemplate || '표준',
      p_admin_member_id: adminMemberId,
      p_created_by: memberId,
    });
```
을:
```js
    const { memberId } = await requireGlobalAdmin();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('create_brand_with_admin', {
      p_name: name.trim(),
      p_code: code.trim(),
      p_workflow_template: workflowTemplate || '표준',
      p_admin_member_id: adminMemberId,
      p_created_by: memberId,
    });
```

`p_admin_member_id: adminMemberId`는 "새 브랜드의 최초 2차 관리자로 지정할 팀원"이라는 별개 의미의 필드라 그대로 둔다 — `p_created_by`만 세션에서 검증된 `memberId`로 채워진다.

- [ ] **Step 2: `app/api/brands/[id]/route.js`**

기존:
```js
    const { memberId, name, code, workflowTemplate, isActive } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);
```
을:
```js
    const { name, code, workflowTemplate, isActive } = body;

    await requireGlobalAdmin();
```

- [ ] **Step 3: `app/api/brand-team/route.js`**

`GET` 함수 안, 기존:
```js
    const memberId = searchParams.get('memberId');
    ...
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    ...
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');
```
(`searchParams.get('memberId')` 줄 삭제.)

`POST` 함수 안, 기존:
```js
    const { memberId, brandId, targetMemberId, tier, subRole } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
```
을:
```js
    const { brandId, targetMemberId, tier, subRole } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
```
기존:
```js
    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    await requireBrandAccess(brandId, '2차');
```

- [ ] **Step 4: `app/api/brand-team/[targetMemberId]/route.js`**

`PATCH`(또는 상단) 함수 안, 기존:
```js
    const { memberId, brandId, tier, subRole } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
```
을:
```js
    const { brandId, tier, subRole } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
```
기존:
```js
    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    await requireBrandAccess(brandId, '2차');
```

`DELETE`(또는 하단) 함수 안, 기존:
```js
    const memberId = searchParams.get('memberId');
    ...
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    ...
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');
```

- [ ] **Step 5: `app/api/brand-categories/route.js`**

기존:
```js
    const { memberId, brandId, categoryName } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
```
을:
```js
    const { brandId, categoryName } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
```
기존:
```js
    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    await requireBrandAccess(brandId, '2차');
```

- [ ] **Step 6: `app/api/brand-categories/[id]/route.js`**

`PATCH` 함수 안, 기존:
```js
    const { memberId, brandId, categoryName, sortOrder } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
```
을:
```js
    const { brandId, categoryName, sortOrder } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');
```
기존:
```js
    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    await requireBrandAccess(brandId, '2차');
```

`DELETE` 함수 안, 기존:
```js
    const memberId = searchParams.get('memberId');
    ...
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');
```
을:
```js
    ...
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    await requireBrandAccess(brandId, '2차');
```

- [ ] **Step 7: `app/api/dashboard/route.js`**

기존:
```js
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);
```
을:
```js
    await requireGlobalAdmin();
```

- [ ] **Step 8: `app/api/team-members/[id]/route.js`**

기존:
```js
    const { memberId, name, isActive, isGlobalAdmin } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);
```
을:
```js
    const { name, isActive, isGlobalAdmin } = body;

    await requireGlobalAdmin();
```

`checkLastGlobalAdmin({ teamMembers, targetMemberId: id })` 호출부는 그대로 둔다 — `id`는 라우트 파라미터(대상 팀원)이고 이번에 지우는 `memberId`는 "누가 요청했는지"(행위자)였으므로 서로 다른 값이라 혼동할 일이 없다.

- [ ] **Step 9: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/brands app/api/brand-team app/api/brand-categories app/api/dashboard app/api/team-members
git commit -m "$(cat <<'EOF'
feat: 브랜드/팀원/카테고리 관리 API가 세션 기반 신원을 쓰도록 리팩터링

EOF
)"
```

---

## Task 13: 클라이언트 fetch 호출부에서 `memberId` 제거

**Files:**
- Modify: `components/BrandFormDialog.jsx`
- Modify: `components/BrandTeamAssignDialog.jsx`
- Modify: `components/BrandTeamSection.jsx`
- Modify: `components/CategorySettings.jsx`
- Modify: `components/KanbanBoard.jsx`
- Modify: `components/MergeDialog.jsx`
- Modify: `components/RequirementDetail.jsx`
- Modify: `components/RequirementEditForm.jsx`
- Modify: `components/RequirementFormDialog.jsx`
- Modify: `components/TeamMemberFormDialog.jsx`
- Modify: `app/admin/brands/page.js`
- Modify: `app/admin/dashboard/page.js`
- Modify: `app/requirements/page.js`
- Modify: `app/requirements/settings/page.js`

브라우저가 쿠키를 자동으로 함께 보내므로, 서버는 더 이상 body/쿼리의 `memberId`를 보지 않는다. 아래 각 파일에서 `identity.memberId`를 body/쿼리에 넣던 부분을 지운다. `identity.brandId`는 계속 보낸다(어느 브랜드의 데이터인지 고르는 값일 뿐이라 안전하다).

- [ ] **Step 1: `components/BrandFormDialog.jsx`**

기존(73, 75행 부근):
```js
      ? { memberId: identity.memberId, name: form.name, code: form.code, workflowTemplate: form.workflowTemplate }
```
을:
```js
      ? { name: form.name, code: form.code, workflowTemplate: form.workflowTemplate }
```
기존:
```js
          memberId: identity.memberId,
```
줄(75행, 새 브랜드 생성 시 body를 구성하는 객체 리터럴 안)을 삭제한다.

- [ ] **Step 2: `components/BrandTeamAssignDialog.jsx`**

기존(61행 부근, body 객체 리터럴 안):
```js
          memberId: identity.memberId,
```
줄을 삭제한다.

- [ ] **Step 3: `components/BrandTeamSection.jsx`**

기존:
```js
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, ...patch }),
```
을:
```js
      body: JSON.stringify({ brandId: identity.brandId, ...patch }),
```
기존:
```js
      `/api/brand-team/${targetMemberId}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
```
을:
```js
      `/api/brand-team/${targetMemberId}?brandId=${identity.brandId}`,
```

- [ ] **Step 4: `components/CategorySettings.jsx`**

기존:
```js
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, categoryName: newName }),
```
을:
```js
      body: JSON.stringify({ brandId: identity.brandId, categoryName: newName }),
```
기존:
```js
      `/api/brand-categories/${id}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
```
을:
```js
      `/api/brand-categories/${id}?brandId=${identity.brandId}`,
```
기존:
```js
        body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, sortOrder: other.sort_order }),
```
을:
```js
        body: JSON.stringify({ brandId: identity.brandId, sortOrder: other.sort_order }),
```
기존:
```js
        body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, sortOrder: current.sort_order }),
```
을:
```js
        body: JSON.stringify({ brandId: identity.brandId, sortOrder: current.sort_order }),
```

- [ ] **Step 5: `components/KanbanBoard.jsx`**

기존:
```js
    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
```
을:
```js
    fetch(`/api/requirements?brandId=${identity.brandId}`)
```
기존:
```js
  }, [identity.brandId, identity.memberId]);
```
을:
```js
  }, [identity.brandId]);
```
기존:
```js
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, status: newStatus }),
```
을:
```js
      body: JSON.stringify({ brandId: identity.brandId, status: newStatus }),
```

- [ ] **Step 6: `components/MergeDialog.jsx`**

기존:
```js
    fetch(`/api/requirements/${source.id}/similar?memberId=${identity.memberId}&brandId=${identity.brandId}`)
```
을:
```js
    fetch(`/api/requirements/${source.id}/similar?brandId=${identity.brandId}`)
```
기존:
```js
    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
```
을:
```js
    fetch(`/api/requirements?brandId=${identity.brandId}`)
```
기존:
```js
  }, [source.id, identity.memberId, identity.brandId]);
```
을:
```js
  }, [source.id, identity.brandId]);
```
기존:
```js
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, targetId }),
```
을:
```js
      body: JSON.stringify({ brandId: identity.brandId, targetId }),
```

- [ ] **Step 7: `components/RequirementDetail.jsx`**

기존:
```js
    fetch(`/api/requirements/${id}?memberId=${identity.memberId}`)
```
을:
```js
    fetch(`/api/requirements/${id}`)
```
기존:
```js
  }, [id, identity.memberId]);
```
을:
```js
  }, [id]);
```
기존:
```js
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, status }),
```
을:
```js
      body: JSON.stringify({ brandId: identity.brandId, status }),
```
77행 부근(담당자 변경 body 객체 리터럴 안)의:
```js
        memberId: identity.memberId,
```
줄을 삭제한다.
기존:
```js
    fd.append('memberId', identity.memberId);
```
줄을 삭제한다(이미지 업로드 `FormData` 구성부).
기존:
```js
      `/api/requirements/${id}/images/${imageId}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
```
을:
```js
      `/api/requirements/${id}/images/${imageId}?brandId=${identity.brandId}`,
```
`(processAllowed || r.requester?.id === identity.memberId) &&`로 시작하는 `canEdit` 계산부는 손대지 않는다(이건 API 호출이 아니라 화면 표시용 클라이언트 게이팅이고, `identity.memberId`가 로그인 후 서버가 내려준 진짜 값을 캐시한 것이므로 그대로 유효하다).

- [ ] **Step 8: `components/RequirementEditForm.jsx`**

79행 부근(PATCH body 객체 리터럴 안)의:
```js
          memberId: identity.memberId,
```
줄을 삭제한다.

- [ ] **Step 9: `components/RequirementFormDialog.jsx`**

101~103행 부근(POST body 객체 리터럴 안), 기존:
```js
          memberId: identity.memberId,
          brandId: identity.brandId,
          requester: identity.memberId,
```
을:
```js
          brandId: identity.brandId,
```
`requester`도 같이 지운다 — 서버가 이제 `requester`를 body에서 받지 않고 세션 값으로 고정하므로(Task 11 Step 1), 클라이언트가 보내도 무시된다. 안 쓰는 필드를 남겨두지 않는다.

122행 부근(이미지 업로드 `FormData` 구성부), 기존:
```js
          fd.append('memberId', identity.memberId);
```
줄을 삭제한다.

- [ ] **Step 10: `components/TeamMemberFormDialog.jsx`**

기존:
```js
        body: JSON.stringify({ memberId: identity.memberId, name }),
```
을:
```js
        body: JSON.stringify({ name }),
```

- [ ] **Step 11: `app/admin/brands/page.js`**

기존:
```js
    fetch(`/api/brands?memberId=${identity.memberId}`)
```
을:
```js
    fetch('/api/brands')
```
기존:
```js
  }, [globalAdmin, identity.memberId, reloadToken]);
```
을:
```js
  }, [globalAdmin, reloadToken]);
```
기존(`toggleBrandActive` 안):
```js
      body: JSON.stringify({ memberId: identity.memberId, isActive: !brand.is_active }),
```
을:
```js
      body: JSON.stringify({ isActive: !brand.is_active }),
```
기존(`toggleMemberActive` 안):
```js
      body: JSON.stringify({ memberId: identity.memberId, isActive: !member.is_active }),
```
을:
```js
      body: JSON.stringify({ isActive: !member.is_active }),
```
기존(`toggleGlobalAdmin` 안):
```js
      body: JSON.stringify({ memberId: identity.memberId, isGlobalAdmin: !member.is_global_admin }),
```
을:
```js
      body: JSON.stringify({ isGlobalAdmin: !member.is_global_admin }),
```

- [ ] **Step 12: `app/admin/dashboard/page.js`**

기존:
```js
    fetch(`/api/dashboard?memberId=${identity.memberId}&days=${period}`)
```
을:
```js
    fetch(`/api/dashboard?days=${period}`)
```
기존:
```js
  }, [globalAdmin, identity.memberId, period]);
```
을:
```js
  }, [globalAdmin, period]);
```

- [ ] **Step 13: `app/requirements/page.js`**

기존(필터 파라미터 구성 객체 안, 27행 부근):
```js
    memberId: identity.memberId,
```
줄을 삭제한다.
기존:
```js
    const params = new URLSearchParams({ brandId: identity.brandId, memberId: identity.memberId });
```
을:
```js
    const params = new URLSearchParams({ brandId: identity.brandId });
```
기존:
```js
  }, [identity.brandId, identity.memberId, reloadToken, filters]);
```
을:
```js
  }, [identity.brandId, reloadToken, filters]);
```

- [ ] **Step 14: `app/requirements/settings/page.js`**

기존:
```js
    fetch(`/api/brand-team?memberId=${identity.memberId}&brandId=${identity.brandId}`)
```
을:
```js
    fetch(`/api/brand-team?brandId=${identity.brandId}`)
```
기존:
```js
  }, [manageBrand, identity.memberId, identity.brandId, reloadToken]);
```
을:
```js
  }, [manageBrand, identity.brandId, reloadToken]);
```

- [ ] **Step 15: 린트 확인**

```bash
npm run lint
```

`react-hooks/exhaustive-deps` 관련 경고가 나면(의존성 배열에서 `identity.memberId`를 지운 곳들), 실제로 그 값이 이펙트 안에서 안 쓰이는지 다시 한번 확인한다 — 각 파일에서 `identity.memberId`를 참조하던 API 호출 부분을 이미 지웠으므로 남아있으면 안 된다.

- [ ] **Step 16: 커밋**

```bash
git add components/BrandFormDialog.jsx components/BrandTeamAssignDialog.jsx components/BrandTeamSection.jsx components/CategorySettings.jsx components/KanbanBoard.jsx components/MergeDialog.jsx components/RequirementDetail.jsx components/RequirementEditForm.jsx components/RequirementFormDialog.jsx components/TeamMemberFormDialog.jsx app/admin/brands/page.js app/admin/dashboard/page.js app/requirements/page.js app/requirements/settings/page.js
git commit -m "$(cat <<'EOF'
feat: 클라이언트 fetch 호출부에서 memberId 전송 제거

EOF
)"
```

---

## Task 14: `app/login/page.js` — 로그인 화면 + 브랜드 선택

**Files:**
- Create: `app/login/page.js`

- [ ] **Step 1: 파일 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';
import { saveIdentity } from '@/lib/identity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  // 'checking' | 'credentials' | 'brand' | 'no-brand'
  const [step, setStep] = useState('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [me, setMe] = useState(null);
  const [brands, setBrands] = useState([]);
  const [brandId, setBrandId] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) {
          setStep('credentials');
          return;
        }
        resolveAfterAuth(data);
      })
      .catch(() => {
        if (!cancelled) setStep('credentials');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolveAfterAuth(meData) {
    if (meData.mustChangePassword) {
      router.push('/change-password');
      return;
    }
    try {
      const brandsRes = await fetch('/api/my-brands');
      const brandsData = await brandsRes.json();
      if (!brandsRes.ok) throw new Error(brandsData.error ?? '브랜드 목록을 불러오지 못했습니다.');

      const list = brandsData.brands ?? [];
      if (list.length === 0) {
        setMe(meData);
        setStep('no-brand');
        return;
      }
      if (list.length === 1) {
        enterBrand(meData, list[0]);
        return;
      }
      setMe(meData);
      setBrands(list);
      setStep('brand');
    } catch (err) {
      setError(err.message);
      setStep('credentials');
    }
  }

  function enterBrand(meData, brand) {
    saveIdentity({
      memberId: meData.memberId,
      name: meData.name,
      isGlobalAdmin: meData.isGlobalAdmin,
      brandId: brand.id,
      tier: brand.tier,
    });
    router.push('/requirements');
  }

  async function handleCredentialsSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');

      const meRes = await fetch('/api/me');
      const meData = await meRes.json();
      if (!meRes.ok) throw new Error(meData.error ?? '로그인 처리 중 오류가 발생했습니다.');

      await resolveAfterAuth(meData);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleBrandSubmit(event) {
    event.preventDefault();
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) return;
    enterBrand(me, brand);
  }

  if (step === 'checking') {
    return <div className="p-6 text-sm text-slate-500">불러오는 중...</div>;
  }

  if (step === 'no-brand') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">아직 배치된 브랜드가 없습니다. 관리자에게 문의하세요.</p>
        </div>
      </main>
    );
  }

  if (step === 'brand') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">브랜드 선택</h1>
          <form onSubmit={handleBrandSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="brand">브랜드</Label>
              <Select
                items={brands.map((b) => ({ value: b.id, label: b.name }))}
                value={brandId || null}
                onValueChange={setBrandId}
                required
              >
                <SelectTrigger id="brand" className="w-full">
                  <SelectValue placeholder="선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              disabled={!brandId}
            >
              입장
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">로그인</h1>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <form onSubmit={handleCredentialsSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

마운트 시 `/api/me`를 먼저 호출해서 "이미 로그인된 세션인지"부터 확인한다 — 이렇게 해야 비밀번호 변경 완료 후 이 화면으로 돌아왔을 때(Task 15) 자격 증명 폼을 다시 보여주지 않고 곧바로 브랜드 선택/입장으로 이어진다.

## Context

`checkBrandAccess`/`user_brand_roles`와 무관하게, 로그인 자체(이메일+비밀번호 검증)는 전부 `supabase.auth.signInWithPassword`에 위임한다. 실패 시 어느 쪽이 틀렸는지 구분하지 않고 하나의 메시지만 보여준다(계정 존재 여부 노출 방지, 스펙에 명시된 내용).

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/login
git commit -m "$(cat <<'EOF'
feat: 이메일/비밀번호 로그인 화면 + 브랜드 선택 단계 추가

EOF
)"
```

---

## Task 15: `app/change-password/page.js` — 비밀번호 변경 화면

**Files:**
- Create: `app/change-password/page.js`

- [ ] **Step 1: 파일 작성**

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      const res = await fetch('/api/me/password-changed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '처리 중 오류가 발생했습니다.');

      router.push('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">비밀번호 변경</h1>
        <p className="mt-1 text-sm text-slate-500">
          임시 비밀번호로는 계속 이용할 수 없습니다. 새 비밀번호를 설정하세요.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-password">새 비밀번호</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

## Context

이 화면은 강제 변경(로그인 직후 `must_change_password`가 true)과 자발적 변경(TopBar의 "비밀번호 변경" 메뉴, Task 16) 양쪽에서 재사용한다 — 둘 다 "로그인된 상태에서 새 비밀번호를 설정하고 `/login`으로 돌아간다"는 동일한 동작이라 분리하지 않는다. 자발적 변경의 경우 `/login`으로 돌아가면 Task 14의 마운트 체크가 이미 로그인된 세션을 찾아 브랜드 재선택 없이(1개 브랜드면) 곧바로 `/requirements`로 넘어간다 — 약간의 왕복이 있지만 코드 경로를 하나로 유지하는 게 더 단순하다.

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/change-password
git commit -m "$(cat <<'EOF'
feat: 비밀번호 변경 화면 추가(강제/자발적 겸용)

EOF
)"
```

---

## Task 16: `app/page.js` 최소화 + IdentityProvider/TopBar 로그아웃 전환

**Files:**
- Modify: `app/page.js`
- Modify: `components/IdentityProvider.jsx`
- Modify: `components/TopBar.jsx`

- [ ] **Step 1: `app/page.js` 전체 교체**

기존의 이름/브랜드 드롭다운 폼을 전부 지우고 최소 스텁으로 바꾼다(실제로는 `middleware.js`가 `/` 요청을 항상 `/login`으로 리다이렉트하므로 이 컴포넌트가 렌더링될 일은 거의 없다 — Next.js App Router가 `/` 라우트를 인식하려면 파일이 있어야 해서 남겨둔다):

```jsx
export default function RootPage() {
  return null;
}
```

- [ ] **Step 2: `components/IdentityProvider.jsx` 수정**

`saveIdentity`는 더 이상 이 파일에서 쓰지 않으므로 import에서 제거하고, `createClient`(브라우저 Supabase 클라이언트)를 새로 import한다. 기존:
```jsx
import { clearIdentity, loadIdentity } from '@/lib/identity';
```
을:
```jsx
import { clearIdentity, loadIdentity } from '@/lib/identity';
import { createClient } from '@/lib/supabaseBrowser';
```

기존:
```jsx
  useEffect(() => {
    if (!loadIdentity()) {
      router.replace('/');
    }
  }, [router]);

  function switchUser() {
    clearIdentity();
    router.replace('/');
  }
```
을:
```jsx
  useEffect(() => {
    if (!loadIdentity()) {
      router.replace('/login');
    }
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearIdentity();
    router.replace('/login');
  }
```

기존:
```jsx
  return (
    <IdentityContext.Provider value={{ identity, switchUser }}>
      {children}
    </IdentityContext.Provider>
  );
```
을:
```jsx
  return (
    <IdentityContext.Provider value={{ identity, logout }}>
      {children}
    </IdentityContext.Provider>
  );
```

- [ ] **Step 3: `components/TopBar.jsx` 수정**

기존:
```jsx
  const { identity, switchUser } = useIdentity();
```
을:
```jsx
  const { identity, logout } = useIdentity();
```

기존:
```jsx
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
```
을:
```jsx
      <div className="flex items-center gap-3">
        <Link href="/change-password" className="text-sm text-slate-500 hover:text-slate-700">
          비밀번호 변경
        </Link>
        <button onClick={logout} className="text-sm text-slate-500 underline hover:text-slate-700">
          로그아웃
        </button>
      </div>
```

"비밀번호 변경" 링크를 이 김에 같이 추가한다 — 스펙의 자발적 비밀번호 변경 요구사항을 채우는 진입점이 지금까지 없었다.

- [ ] **Step 4: 린트 확인 + 커밋**

```bash
npm run lint
git add app/page.js components/IdentityProvider.jsx components/TopBar.jsx
git commit -m "$(cat <<'EOF'
feat: 진입 화면을 로그인으로 대체, 로그아웃/비밀번호 변경 메뉴 연결

EOF
)"
```

---

## Task 17: `POST /api/admin/create-account`

**Files:**
- Create: `app/api/admin/create-account/route.js`

- [ ] **Step 1: 파일 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function POST(request) {
  try {
    await requireGlobalAdmin();

    const body = await request.json();
    const { targetMemberId, email, password } = body;
    if (!targetMemberId || !email || !password) {
      throw new ApiError(400, 'targetMemberId, email, password가 필요합니다.');
    }
    if (password.length < 8) throw new ApiError(400, '비밀번호는 8자 이상이어야 합니다.');

    const supabase = getSupabaseAdmin();

    const { data: target, error: targetError } = await supabase
      .from('team_members')
      .select('id, auth_user_id')
      .eq('id', targetMemberId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new ApiError(404, '팀원을 찾을 수 없습니다.');
    if (target.auth_user_id) throw new ApiError(400, '이미 계정이 있는 팀원입니다.');

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw new ApiError(400, createError.message);

    const { error: updateError } = await supabase
      .from('team_members')
      .update({ auth_user_id: created.user.id, must_change_password: true })
      .eq('id', targetMemberId);
    if (updateError) throw updateError;

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

`email_confirm: true`로 만들어서 실제 이메일 인증 절차 없이 바로 로그인 가능한 상태로 계정이 생성된다(스펙에 명시된 대로 — 실제 회사 이메일이지만 메일함 연동은 필요 없음).

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/admin/create-account
git commit -m "$(cat <<'EOF'
feat: 전체관리자가 팀원 계정을 생성하는 API 추가

EOF
)"
```

---

## Task 18: `POST /api/admin/reset-password`

**Files:**
- Create: `app/api/admin/reset-password/route.js`

- [ ] **Step 1: 파일 작성**

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function POST(request) {
  try {
    await requireGlobalAdmin();

    const body = await request.json();
    const { targetMemberId, password } = body;
    if (!targetMemberId || !password) throw new ApiError(400, 'targetMemberId, password가 필요합니다.');
    if (password.length < 8) throw new ApiError(400, '비밀번호는 8자 이상이어야 합니다.');

    const supabase = getSupabaseAdmin();
    const { data: target, error: targetError } = await supabase
      .from('team_members')
      .select('id, auth_user_id')
      .eq('id', targetMemberId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new ApiError(404, '팀원을 찾을 수 없습니다.');
    if (!target.auth_user_id) throw new ApiError(400, '아직 계정이 없는 팀원입니다.');

    const { error: authError } = await supabase.auth.admin.updateUserById(target.auth_user_id, { password });
    if (authError) throw new ApiError(400, authError.message);

    const { error: updateError } = await supabase
      .from('team_members')
      .update({ must_change_password: true })
      .eq('id', targetMemberId);
    if (updateError) throw updateError;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/admin/reset-password
git commit -m "$(cat <<'EOF'
feat: 전체관리자가 팀원 비밀번호를 재설정하는 API 추가

EOF
)"
```

---

## Task 19: 계정 생성/비밀번호 재설정 다이얼로그 + `/admin/brands` 연결

**Files:**
- Create: `components/AccountCredentialDialog.jsx`
- Modify: `app/admin/brands/page.js`

- [ ] **Step 1: `components/AccountCredentialDialog.jsx` 작성**

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
import { Label } from '@/components/ui/label';

// props: open, onOpenChange, member(대상 팀원, {id, name, auth_user_id}), onSaved()
// member.auth_user_id 유무로 "계정 생성"/"비밀번호 재설정" 모드가 자동으로 정해진다.
export function AccountCredentialDialog({ open, onOpenChange, member, onSaved }) {
  const mode = member?.auth_user_id ? 'reset' : 'create';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail('');
      setPassword('');
      setError('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url = mode === 'create' ? '/api/admin/create-account' : '/api/admin/reset-password';
      const body =
        mode === 'create'
          ? { targetMemberId: member.id, email, password }
          : { targetMemberId: member.id, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '처리에 실패했습니다.');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? `${member?.name ?? ''} 계정 생성` : `${member?.name ?? ''} 비밀번호 재설정`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {mode === 'create' && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="account-email">이메일</Label>
              <Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="account-password">임시 비밀번호</Label>
            <Input
              id="account-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
              {submitting ? '처리 중...' : mode === 'create' ? '계정 생성' : '비밀번호 재설정'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

임시 비밀번호 입력란은 `type="text"`로 둔다(`type="password"`가 아님) — 관리자가 직접 입력한 값을 카카오톡/슬랙 등으로 그대로 전달해야 하므로, 가려져서 오타를 못 알아채는 것보다 눈으로 보이는 게 안전하다.

- [ ] **Step 2: `app/admin/brands/page.js` 수정**

import 추가:
```jsx
import { AccountCredentialDialog } from '@/components/AccountCredentialDialog';
```

state 추가(`memberDialogOpen` 선언 바로 아래):
```jsx
  const [accountDialogTarget, setAccountDialogTarget] = useState(null);
```

팀원 테이블의 액션 셀, 기존:
```jsx
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggleGlobalAdmin(m)}
                    className="mr-3 text-indigo-600 hover:underline"
                  >
                    {m.is_global_admin ? '전체관리자 해제' : '전체관리자 지정'}
                  </button>
                  <button type="button" onClick={() => toggleMemberActive(m)} className="text-slate-500 hover:underline">
                    {m.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
```
을:
```jsx
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setAccountDialogTarget(m)}
                    className="mr-3 text-indigo-600 hover:underline"
                  >
                    {m.auth_user_id ? '비밀번호 재설정' : '계정 생성'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGlobalAdmin(m)}
                    className="mr-3 text-indigo-600 hover:underline"
                  >
                    {m.is_global_admin ? '전체관리자 해제' : '전체관리자 지정'}
                  </button>
                  <button type="button" onClick={() => toggleMemberActive(m)} className="text-slate-500 hover:underline">
                    {m.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
```

파일 하단, `<TeamMemberFormDialog ... />` 바로 아래에 추가:
```jsx
      <AccountCredentialDialog
        open={Boolean(accountDialogTarget)}
        onOpenChange={(v) => {
          if (!v) setAccountDialogTarget(null);
        }}
        member={accountDialogTarget}
        onSaved={refresh}
      />
```

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add components/AccountCredentialDialog.jsx app/admin/brands/page.js
git commit -m "$(cat <<'EOF'
feat: 브랜드 관리 화면에 계정 생성/비밀번호 재설정 다이얼로그 연결

EOF
)"
```

---

## Task 20: 전체 검증 — 부트스트랩 + 로그인 플로우 브라우저 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 린트 + 빌드 확인**

```bash
npm run lint && npm run build
```

Expected: lint 0 errors, build 성공. `npm test`는 이번 작업에서 새로 추가한 순수 로직이 없으므로 기존 60개 테스트가 그대로 통과하는지만 확인한다(`npm test`).

- [ ] **Step 2: Supabase 프로젝트에 환경변수 실제로 설정**

Supabase 대시보드 Project Settings > API에서 anon public 키를 확인해 `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`를 채워 넣는다(Task 2에서 예시만 만들어뒀다면 여기서 실제 값을 넣는다).

- [ ] **Step 3: 마이그레이션 0005 적용 확인**

Task 1에서 Supabase SQL Editor에 마이그레이션을 이미 적용했는지 확인한다. 아직이면 지금 적용한다.

- [ ] **Step 4: 최초 부트스트랩 수행**

1. Supabase 대시보드 Authentication > Users에서 "Add user"로 최초 전체관리자(예: 김관리)의 계정을 이메일+비밀번호로 직접 생성한다(Auto Confirm User 체크).
2. 생성된 사용자의 UUID를 복사한다.
3. SQL Editor에서:
   ```sql
   update team_members
   set auth_user_id = '<복사한 UUID>', must_change_password = true
   where name = '김관리';
   ```

- [ ] **Step 5: 브라우저 시나리오 — 최초 로그인 + 강제 비밀번호 변경**

dev 서버(`npm run dev`) 실행 후:
1. `/`(또는 아무 URL이나) 접속 → `/login`으로 리다이렉트되는지 확인.
2. 방금 만든 이메일/임시 비밀번호로 로그인 → `/change-password`로 강제 이동하는지 확인(다른 URL로 직접 이동 시도해도 튕기는지도 확인).
3. 새 비밀번호 설정 → `/login`으로 돌아간 뒤 곧바로 브랜드 선택(또는 1개면 자동)을 거쳐 `/requirements`로 들어가는지 확인.

- [ ] **Step 6: 브라우저 시나리오 — 계정 생성 + 일반 팀원 로그인**

1. 전체관리자로 `/admin/brands` → 아직 계정 없는 팀원(예: 박스파오) 옆의 "계정 생성" → 이메일+임시비밀번호 입력 → 저장.
2. 로그아웃 → 방금 만든 계정으로 로그인 → 강제 비밀번호 변경 → 소속 브랜드가 여러 개면 선택 화면이 뜨는지, 1개면 바로 들어가는지 확인.
3. 로그인 상태에서 브라우저 개발자도구 Network 탭으로 아무 API 요청이나 확인해서, body/쿼리에 `memberId`가 더 이상 안 실려 있는지 확인.

- [ ] **Step 7: 브라우저 시나리오 — 세션 없이 API 직접 호출**

로그아웃 상태에서 `curl`이나 브라우저 콘솔의 `fetch`로 보호된 API(예: `/api/requirements?brandId=...`)를 직접 호출해서 401이 오는지 확인.

- [ ] **Step 8: 브라우저 시나리오 — 로그아웃**

로그인 상태에서 TopBar의 "로그아웃" 클릭 → `/login`으로 이동하고, 뒤로가기를 눌러도 보호된 페이지에 못 들어가는지(다시 `/login`으로 튕기는지) 확인.

- [ ] **Step 9: 최종 커밋(필요 시)**

브라우저 검증 중 발견된 사소한 수정이 있었다면 그 변경분만 별도로 커밋한다. 문제 없었다면 이 태스크는 커밋 없이 종료.

---

## 스펙 커버리지 자체 점검

- 계정 생성(관리자 직접, 이메일+임시비밀번호, 메일 인증 없이) → Task 17, 19 ✅
- 로그인 세션 유지(Supabase Auth 기본 세션 갱신에 위임, 미들웨어가 매 요청 갱신) → Task 7 ✅
- "다른 사용자로 전환" → 로그아웃 대체 → Task 16 ✅
- 최초 로그인 시 비밀번호 변경 강제 → Task 14, 15 ✅
- 자발적 비밀번호 변경(메뉴) → Task 15, 16 ✅
- 비밀번호 분실 시 관리자 재설정 → Task 18, 19 ✅
- API가 세션 기반 신원을 쓰도록 전면 리팩터링(15개 이상 라우트) → Task 6, 11, 12 ✅
- 클라이언트 fetch에서 memberId 제거 → Task 13 ✅
- `GET /api/team-members`/`GET /api/my-brands` 인증 구멍 → Task 9, 10 ✅
- `requester` 필드 스푸핑 가능했던 부분(요구사항 등록 시 작성자 위조) → Task 11 Step 1 ✅
- 최초 부트스트랩(닭-달걀 문제) → Task 1, 20 ✅
- 새 환경변수/패키지 → Task 2 ✅
- 소속 브랜드 0개인 경우 → Task 14 ✅
- 범위 밖(회원가입, 실제 메일 발송, 계정 빠른 전환, SSO 등) → 계획에도 포함 안 함 ✅
