# 전사 멀티브랜드 요구사항 관리 웹앱 — 2단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요구사항 처리 흐름(칸반 보드·상태변경·이력·중복병합)과 등록 경험 강화(이미지 첨부)를 추가한다.

**Architecture:** 기존 1단계 패턴을 그대로 계승한다 — 브라우저는 Supabase에 직접 접속하지 않고 Next.js Route Handler(`app/api/*`)를 경유하며, 모든 쓰기 라우트는 `requireBrandAccess`로 tier를 재검증한다. 순수 판정 로직(completedAt/merge/imageUpload)은 별도 `lib/*.js`로 분리해 Vitest로 단위 테스트한다. 중복 병합의 원자성은 Postgres 함수(`merge_requirement`)로 보장하고, 이미지는 Supabase Storage 비공개 버킷 + 서버 발급 서명 URL로 다룬다. 보드 드래그 앤 드롭은 `@dnd-kit/core`를 쓴다.

**Tech Stack:** Next.js 16 (App Router, JS) · React 19 · Tailwind v4 · shadcn/@base-ui select·dialog · Supabase(Postgres + Storage) · Vitest · @dnd-kit/core

**작업 위치:** 워크트리 `C:\Users\han_jiwoong\Desktop\agent\.worktrees\multibrand-requirements-app`, 프로젝트 서브디렉터리 `pj/`. 아래 모든 경로는 `pj/` 기준이며, 커밋의 `git add` 경로는 워크트리 루트 기준(`pj/...`)으로 적는다. 명령은 `pj/`에서 실행한다.

---

## 공유 계약 (Shared Contracts)

여러 태스크가 참조하는 데이터 형태다. 태스크를 순서 밖으로 읽더라도 여기서 확인한다.

- **identity (localStorage)**: `{ memberId, name, isGlobalAdmin, brandId, tier }` — `tier ∈ '1차'|'2차'|'3차'`. 전역관리자는 항상 `tier: '1차'`.
- **상태 enum**: `대기 · 요청 · 검토 · 정책정의 · 진행중 · 완료 · 중복` (마지막 '중복'은 병합 전용). 보드 컬럼은 '중복'을 제외한 6개.
- **`GET /api/requirements` 목록 아이템**: `{ id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, image_count, requester:{id,name}|null, category:{id,category_name}|null, assignee:{id,name}|null }`
- **`GET /api/requirements/[id]` 상세**: `{ requirement:{ ...전체컬럼, requester, category, assignee }, history:[change_logs...], duplicates:[duplicate_links...], mergedInto:{id,title}|null, images:[{id, signedUrl, content_type, sort_order}] }`
- **`GET /api/requirements/[id]/similar`**: `{ candidates: [{ id, title, requester_name, status, score }] }`
- **`POST /api/requirements/[id]/images`** 응답 / 삭제 후 재조회: `{ images: [{id, signedUrl, content_type, sort_order}] }`
- **에러 응답**: 항상 `{ error: string }` + HTTP status(400/403/404/500). 기존 `errorResponse`/`ApiError`(`lib/apiError.js`) 사용.
- **권한 헬퍼**: `requireBrandAccess(memberId, brandId, minTier)` (`lib/permissions.js`) → `{ isGlobalAdmin, tier }` 반환, 실패 시 throw. 클라이언트 tier 게이팅은 `canManage(identity)`(Task 6에서 추가).

---

## 파일 구조 (생성/수정 대상)

**신규 순수 로직 (`pj/lib/`)**
- `statuses.js` — 상태 상수(REQUIREMENT_STATUSES, BOARD_STATUSES, MERGED_STATUS='중복', DONE_STATUS='완료')
- `completedAt.js` — `computeCompletedAt(oldStatus, newStatus, prevCompletedAt, nowIso)`
- `merge.js` — `validateMerge({...})`
- `imageUpload.js` — `validateImageUpload({...})` + 상수(ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_REQ)
- `storage.js` — (server-only) Storage 업로드/삭제/서명URL 헬퍼
- 각 순수 로직에 대응 `*.test.js`

**DB**
- `pj/supabase/migrations/0002_phase2.sql` — status CHECK 갱신 + `requirement_images` + pg_trgm + `merge_requirement` 함수
- Storage 비공개 버킷 `requirement-images` (Supabase 대시보드 수동 생성 — Task 1에 절차)

**API 라우트 (`pj/app/api/`)**
- `my-brands/route.js` (수정 — tier 추가)
- `requirements/route.js` (수정 — 필터 + image_count + assignee)
- `requirements/[id]/route.js` (신규 — GET 상세)
- `requirements/[id]/status/route.js` (신규 — PATCH)
- `requirements/[id]/assignee/route.js` (신규 — PATCH)
- `requirements/[id]/merge/route.js` (신규 — POST)
- `requirements/[id]/similar/route.js` (신규 — GET)
- `requirements/[id]/images/route.js` (신규 — POST)
- `requirements/[id]/images/[imageId]/route.js` (신규 — DELETE)

**클라이언트 (`pj/`)**
- `lib/identity.js` (변경 없음, 재사용) · `lib/tiers.js` (수정 — canManage 추가)
- `app/page.js` (수정 — 진입 시 tier 저장)
- `components/TopBar.jsx` (수정 — 보드 링크)
- `components/ImageDropzone.jsx` (신규)
- `components/RequirementFormDialog.jsx` (수정 — 이미지 첨부 + 2단계 제출)
- `components/RequirementList.jsx` (수정 — 중복 muted/이미지 배지/행 클릭)
- `components/FilterBar.jsx` (신규)
- `app/requirements/page.js` (수정 — 필터 바 + 뷰 토글)
- `app/requirements/[id]/page.js` (신규 — 상세)
- `components/RequirementDetail.jsx` (신규 — 상세 본문/사이드바/타임라인/갤러리)
- `components/RequirementCard.jsx` (신규 — 보드 카드)
- `components/KanbanBoard.jsx` (신규 — dnd 보드)
- `app/requirements/board/page.js` (신규 — 보드 페이지)
- `components/MergeDialog.jsx` (신규 — 중복처리 모달)

---

## Task 1: 마이그레이션 0002 + Storage 버킷

**Files:**
- Create: `pj/supabase/migrations/0002_phase2.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `pj/supabase/migrations/0002_phase2.sql`:

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql 실행 이후)

-- 1) requirements.status CHECK 에 '중복' 추가
alter table requirements drop constraint if exists requirements_status_check;
alter table requirements add constraint requirements_status_check
  check (status in ('대기','요청','검토','정책정의','진행중','완료','중복'));

-- 2) 요구사항당 이미지 여러 장
create table requirement_images (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id) on delete cascade,
  brand_id uuid not null references brands(id),
  storage_path text not null,
  content_type text,
  byte_size integer,
  sort_order integer not null default 0,
  uploaded_by uuid references team_members(id),
  created_at timestamptz not null default now()
);
create index idx_requirement_images_req on requirement_images (requirement_id);

-- 3) pg_trgm (중복 후보 유사도)
create extension if not exists pg_trgm;

-- 4) 중복 병합을 원자적으로 처리하는 함수
create or replace function merge_requirement(p_source uuid, p_target uuid, p_member uuid)
returns void language plpgsql as $$
declare
  v_source requirements%rowtype;
  v_target requirements%rowtype;
begin
  select * into v_source from requirements where id = p_source for update;
  select * into v_target from requirements where id = p_target for update;

  update requirements set status = '중복', updated_at = now() where id = p_source;

  insert into change_logs (requirement_id, brand_id, changed_by, change_type,
                           field_name, old_value, new_value, comment)
  values (p_source, v_source.brand_id, p_member, '중복병합',
          'status', v_source.status, '중복',
          format('''%s'' 요청에 병합 (#%s)', v_target.title, p_target));

  update requirements set duplicate_count = duplicate_count + 1, updated_at = now()
    where id = p_target;

  insert into duplicate_links (requirement_id, brand_id, linked_requester, linked_note)
  values (p_target, v_target.brand_id, v_source.requester,
          format('%s (#%s)', v_source.title, p_source));
end;
$$;
```

- [ ] **Step 2: Supabase에 SQL 적용 (수동)**

Supabase 프로젝트 → SQL Editor에 위 파일 내용을 붙여넣어 실행한다. 오류 없이 완료되면
`requirement_images` 테이블과 `merge_requirement` 함수가 생성된다.
검증 쿼리: `select proname from pg_proc where proname = 'merge_requirement';` → 1행.

- [ ] **Step 3: Storage 비공개 버킷 생성 (수동)**

Supabase 대시보드 → Storage → New bucket:
- Name: `requirement-images`
- Public: **off (비공개)**
서비스 롤 키로 서버가 접근하므로 별도 정책 없이도 서버 업로드/서명URL이 동작한다.

- [ ] **Step 4: Commit**

```bash
git add pj/supabase/migrations/0002_phase2.sql
git commit -m "feat(db): 2단계 마이그레이션(중복 status·requirement_images·pg_trgm·merge 함수)"
```

---

## Task 2: 상태 상수 (`lib/statuses.js`)

**Files:**
- Create: `pj/lib/statuses.js`

- [ ] **Step 1: 상수 파일 작성**

Create `pj/lib/statuses.js`:

```js
// 요구사항 상태 단일 출처. '중복'은 병합 전용(직접 전환 불가).
export const REQUIREMENT_STATUSES = ['대기', '요청', '검토', '정책정의', '진행중', '완료', '중복'];

// 보드 컬럼(중복 제외, 왼쪽→오른쪽 순서).
export const BOARD_STATUSES = ['대기', '요청', '검토', '정책정의', '진행중', '완료'];

export const MERGED_STATUS = '중복';
export const DONE_STATUS = '완료';
```

- [ ] **Step 2: Commit**

```bash
git add pj/lib/statuses.js
git commit -m "feat: 요구사항 상태 상수 모듈"
```

---

## Task 3: `computeCompletedAt` (TDD)

**Files:**
- Create: `pj/lib/completedAt.js`
- Test: `pj/lib/completedAt.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `pj/lib/completedAt.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { computeCompletedAt } from './completedAt';

const NOW = '2026-07-22T00:00:00.000Z';

describe('computeCompletedAt', () => {
  it('완료로 진입하면 nowIso로 설정한다', () => {
    expect(computeCompletedAt('진행중', '완료', null, NOW)).toBe(NOW);
  });

  it('완료에서 벗어나면 null로 초기화한다', () => {
    expect(computeCompletedAt('완료', '진행중', '2026-01-01T00:00:00.000Z', NOW)).toBe(null);
  });

  it('완료→완료(변화 없음)는 기존 값을 유지한다', () => {
    expect(computeCompletedAt('완료', '완료', '2026-01-01T00:00:00.000Z', NOW)).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('완료와 무관한 전이는 기존 값(null)을 유지한다', () => {
    expect(computeCompletedAt('대기', '진행중', null, NOW)).toBe(null);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm run test -- completedAt`
Expected: FAIL (`computeCompletedAt` 미정의).

- [ ] **Step 3: 구현**

Create `pj/lib/completedAt.js`:

```js
import { DONE_STATUS } from './statuses';

// 상태 전이에 따라 저장할 completed_at 값을 계산한다(순수 함수).
// - 완료로 진입: nowIso
// - 완료에서 이탈: null
// - 그 외: 기존 값 유지
export function computeCompletedAt(oldStatus, newStatus, prevCompletedAt, nowIso) {
  if (newStatus === DONE_STATUS && oldStatus !== DONE_STATUS) return nowIso;
  if (oldStatus === DONE_STATUS && newStatus !== DONE_STATUS) return null;
  return prevCompletedAt;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- completedAt`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add pj/lib/completedAt.js pj/lib/completedAt.test.js
git commit -m "feat: computeCompletedAt 순수 로직 + 테스트"
```

---

## Task 4: `validateMerge` (TDD)

**Files:**
- Create: `pj/lib/merge.js`
- Test: `pj/lib/merge.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `pj/lib/merge.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { validateMerge } from './merge';

const base = {
  sourceId: 'a',
  targetId: 'b',
  sourceStatus: '대기',
  targetStatus: '진행중',
  sameBrand: true,
};

describe('validateMerge', () => {
  it('정상 케이스는 ok', () => {
    expect(validateMerge(base)).toEqual({ ok: true });
  });

  it('대상 미선택은 거부', () => {
    expect(validateMerge({ ...base, targetId: null }).ok).toBe(false);
  });

  it('자기 자신에 병합은 거부', () => {
    expect(validateMerge({ ...base, targetId: 'a' }).ok).toBe(false);
  });

  it('다른 브랜드는 거부', () => {
    expect(validateMerge({ ...base, sameBrand: false }).ok).toBe(false);
  });

  it('이미 중복인 소스는 거부', () => {
    expect(validateMerge({ ...base, sourceStatus: '중복' }).ok).toBe(false);
  });

  it('중복 상태의 대상은 거부', () => {
    expect(validateMerge({ ...base, targetStatus: '중복' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm run test -- merge`
Expected: FAIL (`validateMerge` 미정의).

- [ ] **Step 3: 구현**

Create `pj/lib/merge.js`:

```js
import { MERGED_STATUS } from './statuses';

// 중복 병합 유효성(순수 함수). ok:false면 error 메시지를 함께 반환.
export function validateMerge({ sourceId, targetId, sourceStatus, targetStatus, sameBrand }) {
  if (!targetId) return { ok: false, error: '병합 대상을 선택하세요.' };
  if (sourceId === targetId) return { ok: false, error: '자기 자신에는 병합할 수 없습니다.' };
  if (!sameBrand) return { ok: false, error: '다른 브랜드의 요구사항과는 병합할 수 없습니다.' };
  if (sourceStatus === MERGED_STATUS) return { ok: false, error: '이미 중복 처리된 요구사항입니다.' };
  if (targetStatus === MERGED_STATUS) {
    return { ok: false, error: '중복 처리된 요구사항을 대상으로 병합할 수 없습니다.' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- merge`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add pj/lib/merge.js pj/lib/merge.test.js
git commit -m "feat: validateMerge 순수 로직 + 테스트"
```

---

## Task 5: `validateImageUpload` (TDD)

**Files:**
- Create: `pj/lib/imageUpload.js`
- Test: `pj/lib/imageUpload.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `pj/lib/imageUpload.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { validateImageUpload, MAX_IMAGE_BYTES, MAX_IMAGES_PER_REQ } from './imageUpload';

const ok = { contentType: 'image/png', byteSize: 1000, currentCount: 0 };

describe('validateImageUpload', () => {
  it('정상 케이스는 ok', () => {
    expect(validateImageUpload(ok)).toEqual({ ok: true });
  });

  it('허용되지 않는 MIME은 거부', () => {
    expect(validateImageUpload({ ...ok, contentType: 'application/pdf' }).ok).toBe(false);
  });

  it('최대 크기 초과는 거부', () => {
    expect(validateImageUpload({ ...ok, byteSize: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
  });

  it('최대 크기 경계값은 허용', () => {
    expect(validateImageUpload({ ...ok, byteSize: MAX_IMAGE_BYTES }).ok).toBe(true);
  });

  it('개수 한도에 도달하면 거부', () => {
    expect(validateImageUpload({ ...ok, currentCount: MAX_IMAGES_PER_REQ }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm run test -- imageUpload`
Expected: FAIL.

- [ ] **Step 3: 구현**

Create `pj/lib/imageUpload.js`:

```js
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES_PER_REQ = 10;

// 이미지 업로드 유효성(순수 함수). 파일 1개 기준으로 판정한다.
export function validateImageUpload({ contentType, byteSize, currentCount }) {
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return { ok: false, error: '지원하지 않는 이미지 형식입니다.' };
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    return { ok: false, error: '이미지 크기는 10MB 이하여야 합니다.' };
  }
  if (currentCount >= MAX_IMAGES_PER_REQ) {
    return { ok: false, error: '이미지는 최대 10개까지 첨부할 수 있습니다.' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- imageUpload`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add pj/lib/imageUpload.js pj/lib/imageUpload.test.js
git commit -m "feat: validateImageUpload 순수 로직 + 테스트"
```

---

## Task 6: identity tier 심기 — API + 헬퍼

**Files:**
- Modify: `pj/app/api/my-brands/route.js`
- Modify: `pj/lib/tiers.js`

- [ ] **Step 1: `lib/tiers.js`에 canManage 추가**

`pj/lib/tiers.js` 전체를 다음으로 교체:

```js
export const TIER_RANK = { '3차': 1, '2차': 2, '1차': 3 };

// 클라이언트 UI 게이팅용(보안 경계 아님). 2차 이상이면 처리 권한이 있다.
export function canManage(identity) {
  return identity?.tier === '1차' || identity?.tier === '2차';
}
```

- [ ] **Step 2: `my-brands` 응답에 tier 추가**

`pj/app/api/my-brands/route.js` 전체를 다음으로 교체:

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
    if (memberError) {
      console.error(memberError);
      throw new ApiError(500, '사용자 조회 중 오류가 발생했습니다.');
    }
    if (!member || !member.is_active) {
      throw new ApiError(403, '유효하지 않은 사용자입니다.');
    }

    if (member.is_global_admin) {
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

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add pj/app/api/my-brands/route.js pj/lib/tiers.js
git commit -m "feat: my-brands 응답에 tier 추가 + canManage 헬퍼"
```

---

## Task 7: 진입 화면에서 tier 저장

**Files:**
- Modify: `pj/app/page.js`

- [ ] **Step 1: 브랜드 선택 시 tier를 identity에 저장**

`pj/app/page.js`의 `handleSubmit` 함수를 다음으로 교체(브랜드 객체에서 tier를 읽어 저장):

```js
  function handleSubmit(event) {
    event.preventDefault();
    const member = teamMembers.find((m) => m.id === memberId);
    const brand = brands.find((b) => b.id === brandId);
    if (!member || !brand) return;
    saveIdentity({
      memberId: member.id,
      name: member.name,
      isGlobalAdmin: member.is_global_admin,
      brandId: brand.id,
      tier: brand.tier,
    });
    router.push('/requirements');
  }
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add pj/app/page.js
git commit -m "feat: 진입 시 선택 브랜드의 tier를 identity에 저장"
```

---

## Task 8: 목록 API 확장 (필터 + image_count + assignee)

**Files:**
- Modify: `pj/app/api/requirements/route.js` (GET 함수만)

- [ ] **Step 1: GET 함수 교체**

`pj/app/api/requirements/route.js`의 `export async function GET(request) { ... }` 블록만 다음으로 교체한다(POST 함수는 그대로 둔다):

```js
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const memberId = searchParams.get('memberId');
    if (!brandId || !memberId) throw new ApiError(400, 'brandId와 memberId가 필요합니다.');

    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '3차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('requirements')
      .select(
        'id, priority, urgency, request_date, status, title, is_confidential, sprint_tag, duplicate_count, ' +
          'requester:team_members!requirements_requester_fkey(id, name), ' +
          'assignee:team_members!requirements_assignee_fkey(id, name), ' +
          'category:brand_categories(id, category_name), ' +
          'requirement_images(count)'
      )
      .eq('brand_id', brandId)
      .order('request_date', { ascending: false });

    if (!canSeeConfidential) query = query.eq('is_confidential', false);
    if (status) query = query.eq('status', status);
    if (assignee) query = query.eq('assignee', assignee);
    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);

    const { data, error } = await query;
    if (error) throw error;

    const requirements = (data ?? []).map((row) => {
      const { requirement_images, ...rest } = row;
      return { ...rest, image_count: requirement_images?.[0]?.count ?? 0 };
    });
    return Response.json({ requirements });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add pj/app/api/requirements/route.js
git commit -m "feat(api): 요구사항 목록 필터(status/assignee/category/priority) + image_count + assignee"
```

---

## Task 9: Storage 헬퍼 (`lib/storage.js`)

**Files:**
- Create: `pj/lib/storage.js`

- [ ] **Step 1: 헬퍼 작성**

Create `pj/lib/storage.js`:

```js
import 'server-only';
import { getSupabaseAdmin } from './supabaseAdmin';

export const IMAGE_BUCKET = 'requirement-images';

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function extForContentType(contentType) {
  return EXT_BY_TYPE[contentType] ?? 'bin';
}

// 파일 하나를 업로드하고 저장 경로를 반환한다.
export async function uploadImage({ brandId, requirementId, buffer, contentType }) {
  const supabase = getSupabaseAdmin();
  const ext = extForContentType(contentType);
  const path = `${brandId}/${requirementId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, buffer, { contentType });
  if (error) throw error;
  return path;
}

export async function removeImageObject(path) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}

// storage_path 배열 → { path: signedUrl } 맵. 짧은 TTL(기본 300초).
export async function signImagePaths(paths, expiresIn = 300) {
  if (!paths.length) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

// requirement_images 행 배열 → 클라이언트용 { id, signedUrl, content_type, sort_order }.
export async function toSignedImageList(rows) {
  const paths = (rows ?? []).map((r) => r.storage_path);
  const signed = await signImagePaths(paths);
  return (rows ?? []).map((r) => ({
    id: r.id,
    signedUrl: signed[r.storage_path] ?? null,
    content_type: r.content_type,
    sort_order: r.sort_order,
  }));
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add pj/lib/storage.js
git commit -m "feat: Supabase Storage 이미지 헬퍼(업로드/삭제/서명URL)"
```

---

## Task 10: 상세 API (`GET /api/requirements/[id]`)

**Files:**
- Create: `pj/app/api/requirements/[id]/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/requirements/[id]/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { TIER_RANK } from '@/lib/tiers';
import { MERGED_STATUS } from '@/lib/statuses';
import { toSignedImageList } from '@/lib/storage';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    const supabase = getSupabaseAdmin();
    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select(
        '*, requester:team_members!requirements_requester_fkey(id, name), ' +
          'assignee:team_members!requirements_assignee_fkey(id, name), ' +
          'category:brand_categories(id, category_name)'
      )
      .eq('id', id)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, requirement.brand_id, '3차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];
    if (requirement.is_confidential && !canSeeConfidential) {
      throw new ApiError(403, '비공개 요구사항은 조회할 수 없습니다.');
    }

    const { data: history, error: histError } = await supabase
      .from('change_logs')
      .select('id, changed_by, change_type, field_name, old_value, new_value, comment, created_at, ' +
        'changer:team_members!change_logs_changed_by_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (histError) throw histError;

    const { data: duplicates, error: dupError } = await supabase
      .from('duplicate_links')
      .select('id, linked_note, requester:team_members!duplicate_links_linked_requester_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (dupError) throw dupError;

    let mergedInto = null;
    if (requirement.status === MERGED_STATUS) {
      const { data: link } = await supabase
        .from('duplicate_links')
        .select('target:requirements!duplicate_links_requirement_id_fkey(id, title)')
        .like('linked_note', `% (#${id})`)
        .limit(1)
        .maybeSingle();
      if (link?.target) mergedInto = { id: link.target.id, title: link.target.title };
    }

    const { data: imageRows, error: imgError } = await supabase
      .from('requirement_images')
      .select('id, storage_path, content_type, sort_order')
      .eq('requirement_id', id)
      .order('sort_order', { ascending: true });
    if (imgError) throw imgError;
    const images = await toSignedImageList(imageRows);

    return Response.json({ requirement, history, duplicates, mergedInto, images });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add "pj/app/api/requirements/[id]/route.js"
git commit -m "feat(api): 요구사항 상세(본문+이력+병합요청자+mergedInto+이미지)"
```

---

## Task 11: 상태 변경 API (`PATCH .../status`)

**Files:**
- Create: `pj/app/api/requirements/[id]/status/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/requirements/[id]/status/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { BOARD_STATUSES, MERGED_STATUS } from '@/lib/statuses';
import { computeCompletedAt } from '@/lib/completedAt';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, status } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (status === MERGED_STATUS) {
      throw new ApiError(400, "'중복'은 중복처리로만 설정할 수 있습니다.");
    }
    if (!BOARD_STATUSES.includes(status)) {
      throw new ApiError(400, '유효하지 않은 상태입니다.');
    }

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id, status, completed_at')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    const nowIso = new Date().toISOString();
    const completedAt = computeCompletedAt(current.status, status, current.completed_at, nowIso);

    const { error: updError } = await supabase
      .from('requirements')
      .update({ status, completed_at: completedAt, updated_at: nowIso })
      .eq('id', id);
    if (updError) throw updError;

    const { error: logError } = await supabase.from('change_logs').insert({
      requirement_id: id,
      brand_id: brandId,
      changed_by: memberId,
      change_type: '상태변경',
      field_name: 'status',
      old_value: current.status,
      new_value: status,
    });
    if (logError) throw logError;

    return Response.json({ ok: true, status });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add "pj/app/api/requirements/[id]/status/route.js"
git commit -m "feat(api): 상태 변경 + change_logs 기록 + completed_at 처리"
```

---

## Task 12: 담당자 지정 API (`PATCH .../assignee`)

**Files:**
- Create: `pj/app/api/requirements/[id]/assignee/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/requirements/[id]/assignee/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, assignee } = body; // assignee: team_member id 또는 null
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    if (assignee) {
      // 담당자는 같은 브랜드 소속(또는 전역관리자)이어야 한다.
      const { data: role } = await supabase
        .from('user_brand_roles')
        .select('id')
        .eq('team_member_id', assignee)
        .eq('brand_id', brandId)
        .maybeSingle();
      const { data: adminMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', assignee)
        .eq('is_global_admin', true)
        .maybeSingle();
      if (!role && !adminMember) {
        throw new ApiError(400, '담당자는 해당 브랜드 소속이어야 합니다.');
      }
    }

    const { error: updError } = await supabase
      .from('requirements')
      .update({ assignee: assignee || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updError) throw updError;

    return Response.json({ ok: true, assignee: assignee || null });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add "pj/app/api/requirements/[id]/assignee/route.js"
git commit -m "feat(api): 담당자 지정(브랜드 소속 검증, 이력 미기록)"
```

---

## Task 13: 중복 병합 API (`POST .../merge`)

**Files:**
- Create: `pj/app/api/requirements/[id]/merge/route.js`

- [ ] **Step 1: 라우트 작성**

Create `pj/app/api/requirements/[id]/merge/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { validateMerge } from '@/lib/merge';

export async function POST(request, { params }) {
  try {
    const { id } = await params; // source(중복이 될 건)
    const body = await request.json();
    const { memberId, brandId, targetId } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: rows, error: fetchError } = await supabase
      .from('requirements')
      .select('id, brand_id, status')
      .in('id', [id, targetId].filter(Boolean));
    if (fetchError) throw fetchError;

    const source = (rows ?? []).find((r) => r.id === id);
    const target = (rows ?? []).find((r) => r.id === targetId);
    if (!source) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (source.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');
    if (!target) throw new ApiError(404, '병합 대상을 찾을 수 없습니다.');

    const check = validateMerge({
      sourceId: id,
      targetId,
      sourceStatus: source.status,
      targetStatus: target.status,
      sameBrand: source.brand_id === target.brand_id,
    });
    if (!check.ok) throw new ApiError(400, check.error);

    const { error: rpcError } = await supabase.rpc('merge_requirement', {
      p_source: id,
      p_target: targetId,
      p_member: memberId,
    });
    if (rpcError) throw rpcError;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add "pj/app/api/requirements/[id]/merge/route.js"
git commit -m "feat(api): 중복 병합(validateMerge + merge_requirement RPC로 원자 처리)"
```

---

## Task 14: 유사 후보 API (`GET .../similar`)

**Files:**
- Create: `pj/app/api/requirements/[id]/similar/route.js`

- [ ] **Step 1: 라우트 작성**

pg_trgm `similarity()`는 Supabase JS 빌더로 직접 표현하기 어려우므로, 후보를 서버에서
가져와 **JS로 유사도를 계산**한다(초기 데이터 규모가 작아 충분). trigram 유사도는 두 문자열의
3-gram 집합 자카드 유사도로 근사한다.

Create `pj/app/api/requirements/[id]/similar/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { MERGED_STATUS } from '@/lib/statuses';
import { trigramSimilarity } from '@/lib/similarity';

const SIMILARITY_THRESHOLD = 0.2;
const MAX_CANDIDATES = 5;

function combinedText(row) {
  return [row.title, row.as_is, row.to_be].filter(Boolean).join(' ');
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '2차');

    const supabase = getSupabaseAdmin();
    const { data: self, error: selfError } = await supabase
      .from('requirements')
      .select('id, title, as_is, to_be')
      .eq('id', id)
      .maybeSingle();
    if (selfError) throw selfError;
    if (!self) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    const { data: others, error: othersError } = await supabase
      .from('requirements')
      .select('id, title, as_is, to_be, status, requester:team_members!requirements_requester_fkey(name)')
      .eq('brand_id', brandId)
      .neq('id', id)
      .neq('status', MERGED_STATUS);
    if (othersError) throw othersError;

    const selfText = combinedText(self);
    const candidates = (others ?? [])
      .map((row) => ({
        id: row.id,
        title: row.title,
        requester_name: row.requester?.name ?? null,
        status: row.status,
        score: trigramSimilarity(selfText, combinedText(row)),
      }))
      .filter((c) => c.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    return Response.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 유사도 순수 함수 + 테스트**

Create `pj/lib/similarity.js`:

```js
// 문자열을 3-gram 집합으로 만들고 자카드 유사도를 계산한다(pg_trgm 근사).
function trigrams(text) {
  const s = `  ${(text ?? '').toLowerCase().trim()} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i += 1) set.add(s.slice(i, i + 3));
  return set;
}

export function trigramSimilarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}
```

Create `pj/lib/similarity.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { trigramSimilarity } from './similarity';

describe('trigramSimilarity', () => {
  it('동일 문자열은 1', () => {
    expect(trigramSimilarity('결제 버튼 색상', '결제 버튼 색상')).toBe(1);
  });
  it('완전히 다른 문자열은 낮다', () => {
    expect(trigramSimilarity('결제 버튼', '배송 지연 문의')).toBeLessThan(0.2);
  });
  it('유사한 문자열은 임계값 이상', () => {
    expect(trigramSimilarity('결제 페이지 버튼 색상 변경', '결제 페이지 버튼 색 변경')).toBeGreaterThan(0.2);
  });
  it('빈 문자열은 0', () => {
    expect(trigramSimilarity('', '결제')).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm run test -- similarity`
Expected: PASS (4 tests).

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add pj/lib/similarity.js pj/lib/similarity.test.js "pj/app/api/requirements/[id]/similar/route.js"
git commit -m "feat(api): 중복 유사 후보 제시(trigram 유사도) + 순수 로직 테스트"
```

---

## Task 15: 이미지 업로드/삭제 API

**Files:**
- Create: `pj/app/api/requirements/[id]/images/route.js`
- Create: `pj/app/api/requirements/[id]/images/[imageId]/route.js`

- [ ] **Step 1: 업로드(POST) 라우트 작성**

Create `pj/app/api/requirements/[id]/images/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { validateImageUpload } from '@/lib/imageUpload';
import { uploadImage, toSignedImageList } from '@/lib/storage';

async function loadImageList(supabase, requirementId) {
  const { data, error } = await supabase
    .from('requirement_images')
    .select('id, storage_path, content_type, sort_order')
    .eq('requirement_id', requirementId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const memberId = form.get('memberId');
    const brandId = form.get('brandId');
    const files = form.getAll('files').filter((f) => typeof f === 'object' && f.size !== undefined);
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');
    if (files.length === 0) throw new ApiError(400, '업로드할 이미지가 없습니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    let existing = await loadImageList(supabase, id);
    let nextSort = existing.length;

    for (const file of files) {
      const check = validateImageUpload({
        contentType: file.type,
        byteSize: file.size,
        currentCount: existing.length,
      });
      if (!check.ok) throw new ApiError(400, check.error);

      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadImage({
        brandId,
        requirementId: id,
        buffer,
        contentType: file.type,
      });
      const { error: insError } = await supabase.from('requirement_images').insert({
        requirement_id: id,
        brand_id: brandId,
        storage_path: path,
        content_type: file.type,
        byte_size: file.size,
        sort_order: nextSort,
        uploaded_by: memberId,
      });
      if (insError) throw insError;
      nextSort += 1;
      existing = await loadImageList(supabase, id);
    }

    const images = await toSignedImageList(existing);
    return Response.json({ images }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: 삭제(DELETE) 라우트 작성**

Create `pj/app/api/requirements/[id]/images/[imageId]/route.js`:

```js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { removeImageObject } from '@/lib/storage';

export async function DELETE(request, { params }) {
  try {
    const { id, imageId } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const brandId = searchParams.get('brandId');
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    await requireBrandAccess(memberId, brandId, '3차');

    const supabase = getSupabaseAdmin();
    const { data: image, error: imgError } = await supabase
      .from('requirement_images')
      .select('id, requirement_id, brand_id, storage_path')
      .eq('id', imageId)
      .maybeSingle();
    if (imgError) throw imgError;
    if (!image || image.requirement_id !== id) {
      throw new ApiError(404, '이미지를 찾을 수 없습니다.');
    }
    if (image.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');

    await removeImageObject(image.storage_path);
    const { error: delError } = await supabase
      .from('requirement_images')
      .delete()
      .eq('id', imageId);
    if (delError) throw delError;

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add "pj/app/api/requirements/[id]/images/route.js" "pj/app/api/requirements/[id]/images/[imageId]/route.js"
git commit -m "feat(api): 이미지 업로드/삭제(비공개 버킷 + 개수/크기/MIME 검증)"
```

---

## Task 16: 이미지 드롭존 컴포넌트 (`ImageDropzone`)

**Files:**
- Create: `pj/components/ImageDropzone.jsx`

로컬 파일(File 객체) 목록을 부모가 관리하고, 이 컴포넌트는 파일선택/드래그/붙여넣기로
File을 추가하고 썸네일+삭제를 렌더한다. 상세/등록 양쪽에서 재사용한다.

- [ ] **Step 1: 컴포넌트 작성**

Create `pj/components/ImageDropzone.jsx`:

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { ALLOWED_IMAGE_TYPES } from '@/lib/imageUpload';

// props:
//  - files: File[] (부모 소유)
//  - onAdd(newFiles: File[])
//  - onRemove(index: number)
export function ImageDropzone({ files, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function acceptFiles(list) {
    const imgs = Array.from(list).filter((f) => ALLOWED_IMAGE_TYPES.includes(f.type));
    if (imgs.length) onAdd(imgs);
  }

  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items ?? [];
      const imgs = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && ALLOWED_IMAGE_TYPES.includes(file.type)) imgs.push(file);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        onAdd(imgs);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onAdd]);

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 text-slate-500'
        }`}
      >
        이미지를 드래그하거나 클릭해서 선택 · 스크린샷은 Ctrl+V로 붙여넣기
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            acceptFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previews.map((url, i) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="h-20 w-full rounded-md border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add pj/components/ImageDropzone.jsx
git commit -m "feat: 이미지 드롭존(파일/드래그/붙여넣기 + 썸네일 미리보기)"
```

---

## Task 17: 등록 폼에 이미지 첨부 통합

**Files:**
- Modify: `pj/components/RequirementFormDialog.jsx`

현재 `RequirementFormDialog`는 `handleSubmit`에서 `POST /api/requirements`(JSON)만 호출한다.
이미지 상태를 추가하고, 요구사항 생성 후 반환된 id로 `POST .../images`를 호출한다.

- [ ] **Step 1: import 추가**

`pj/components/RequirementFormDialog.jsx` 상단 import 목록에 다음 두 줄을 추가한다:

```jsx
import { useState } from 'react';
import { ImageDropzone } from '@/components/ImageDropzone';
```

(`useState`가 이미 import되어 있으면 중복 추가하지 말고 `ImageDropzone`만 추가한다.)

- [ ] **Step 2: 이미지 파일 상태 추가**

`RequirementFormDialog` 함수 본문에서 기존 `const [form, setForm] = useState(emptyForm());` 아래에 추가:

```jsx
  const [imageFiles, setImageFiles] = useState([]);
```

- [ ] **Step 3: 제출 로직에 이미지 업로드 단계 추가**

`handleSubmit` 안에서, 요구사항 생성 성공 처리 부분을 다음과 같이 바꾼다. 기존 코드에서
`if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');` 다음에 있던
`setForm(emptyForm()); onOpenChange(false); onCreated();` 세 줄을 아래로 교체:

```jsx
      const created = data.requirement;
      if (imageFiles.length > 0 && created?.id) {
        try {
          const fd = new FormData();
          fd.append('memberId', identity.memberId);
          fd.append('brandId', identity.brandId);
          imageFiles.forEach((f) => fd.append('files', f));
          const imgRes = await fetch(`/api/requirements/${created.id}/images`, {
            method: 'POST',
            body: fd,
          });
          if (!imgRes.ok) {
            const imgData = await imgRes.json();
            throw new Error(imgData.error ?? '이미지 업로드에 실패했습니다.');
          }
        } catch (imgErr) {
          // 본문은 이미 저장됨 — 상세에서 이미지 재시도 가능. 경고만 남기고 진행.
          setError(`요구사항은 등록됐지만 이미지 업로드에 실패했습니다: ${imgErr.message}`);
        }
      }
      setForm(emptyForm());
      setImageFiles([]);
      onOpenChange(false);
      onCreated();
```

- [ ] **Step 4: 이미지 드롭존 UI 추가**

폼 안에서 "비고" 필드(`note`) 블록 바로 아래, 비공개 체크박스 블록 바로 위에 추가:

```jsx
          <div className="flex flex-col gap-1">
            <Label>이미지 첨부</Label>
            <ImageDropzone
              files={imageFiles}
              onAdd={(added) => setImageFiles((prev) => [...prev, ...added])}
              onRemove={(i) => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add pj/components/RequirementFormDialog.jsx
git commit -m "feat: 등록 폼 이미지 첨부(본문 생성 후 업로드 2단계)"
```

---

## Task 18: 요구사항 상세 페이지

**Files:**
- Create: `pj/components/RequirementDetail.jsx`
- Create: `pj/app/requirements/[id]/page.js`

- [ ] **Step 1: 상세 컴포넌트 작성**

Create `pj/components/RequirementDetail.jsx`:

```jsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { canManage } from '@/lib/tiers';
import { BOARD_STATUSES } from '@/lib/statuses';
import { ImageDropzone } from '@/components/ImageDropzone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString('ko-KR') : '';
}

export function RequirementDetail({ id }) {
  const { identity } = useIdentity();
  const manage = canManage(identity);
  const [data, setData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState('');
  const [newFiles, setNewFiles] = useState([]);

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch(`/api/requirements/${id}?memberId=${identity.memberId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [id, identity.memberId]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(status) {
    const res = await fetch(`/api/requirements/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, status }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '상태 변경 실패');
      return;
    }
    load();
  }

  async function changeAssignee(assignee) {
    const res = await fetch(`/api/requirements/${id}/assignee`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: identity.memberId,
        brandId: identity.brandId,
        assignee: assignee === '__none__' ? null : assignee,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '담당자 변경 실패');
      return;
    }
    load();
  }

  async function uploadNew() {
    if (newFiles.length === 0) return;
    const fd = new FormData();
    fd.append('memberId', identity.memberId);
    fd.append('brandId', identity.brandId);
    newFiles.forEach((f) => fd.append('files', f));
    const res = await fetch(`/api/requirements/${id}/images`, { method: 'POST', body: fd });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '이미지 업로드 실패');
      return;
    }
    setNewFiles([]);
    load();
  }

  async function deleteImage(imageId) {
    const res = await fetch(
      `/api/requirements/${id}/images/${imageId}?memberId=${identity.memberId}&brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '이미지 삭제 실패');
      return;
    }
    load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  const { requirement: r, history, duplicates, mergedInto, images } = data;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/requirements" className="text-sm text-slate-500 hover:text-slate-700">
        ← 목록으로
      </Link>

      {mergedInto && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          이 요청은{' '}
          <Link href={`/requirements/${mergedInto.id}`} className="text-indigo-600 underline">
            &lsquo;{mergedInto.title}&rsquo;
          </Link>{' '}
          요청에 병합되었습니다.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-4 md:col-span-2">
          <h1 className="text-lg font-semibold text-slate-900">{r.title}</h1>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-medium text-slate-500">As-Is</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-900">{r.as_is || '-'}</p>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-medium text-slate-500">To-Be</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-900">{r.to_be || '-'}</p>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-medium text-slate-500">비고</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-900">{r.note || '-'}</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-medium text-slate-500">이미지</h2>
            {images.length === 0 && <p className="text-sm text-slate-400">첨부된 이미지가 없습니다.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="relative">
                  <a href={img.signedUrl} target="_blank" rel="noreferrer">
                    <img
                      src={img.signedUrl}
                      alt=""
                      className="h-20 w-full rounded-md border border-slate-200 object-cover"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteImage(img.id)}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <ImageDropzone
                files={newFiles}
                onAdd={(added) => setNewFiles((prev) => [...prev, ...added])}
                onRemove={(i) => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
              {newFiles.length > 0 && (
                <button
                  type="button"
                  onClick={uploadNew}
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                >
                  {newFiles.length}개 업로드
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div>
            <p className="text-slate-500">상태</p>
            {manage ? (
              <Select
                items={BOARD_STATUSES.map((s) => ({ value: s, label: s }))}
                value={r.status}
                onValueChange={changeStatus}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-medium text-slate-900">{r.status}</p>
            )}
          </div>
          <div>
            <p className="text-slate-500">담당자</p>
            {manage ? (
              <Select
                items={[
                  { value: '__none__', label: '미지정' },
                  ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
                ]}
                value={r.assignee?.id ?? '__none__'}
                onValueChange={changeAssignee}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">미지정</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-medium text-slate-900">{r.assignee?.name ?? '미지정'}</p>
            )}
          </div>
          <MetaRow label="카테고리" value={r.category?.category_name ?? '-'} />
          <MetaRow label="요청자" value={r.requester?.name ?? '-'} />
          <MetaRow label="요청일" value={r.request_date ?? '-'} />
          <MetaRow label="우선순위" value={r.priority ?? '-'} />
          <MetaRow label="긴급도" value={r.urgency ?? '-'} />
          {r.is_confidential && <p className="text-rose-600">비공개</p>}
        </aside>
      </div>

      {duplicates.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-500">이 요청에 병합된 요청</h2>
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.linked_note} — 요청자 {d.requester?.name ?? '-'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-500">활동</h2>
        {history.length === 0 && <p className="text-sm text-slate-400">기록이 없습니다.</p>}
        <ul className="flex flex-col gap-2 text-sm text-slate-700">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">
                {(h.changer?.name ?? '?').slice(0, 1)}
              </span>
              <span>
                {h.changer?.name ?? '누군가'}님이 {h.change_type === '중복병합' ? h.comment : `상태를 ${h.old_value}→${h.new_value}로 변경`}
                <span className="text-slate-400"> · {fmt(h.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: 상세 페이지 라우트 작성**

Create `pj/app/requirements/[id]/page.js`:

```jsx
import { RequirementDetail } from '@/components/RequirementDetail';

export default async function RequirementDetailPage({ params }) {
  const { id } = await params;
  return <RequirementDetail id={id} />;
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add pj/components/RequirementDetail.jsx "pj/app/requirements/[id]/page.js"
git commit -m "feat: 요구사항 상세 페이지(본문+메타 사이드바+활동 타임라인+이미지 갤러리)"
```

---

## Task 19: 목록 뷰 — 필터 바 + 뷰 토글 + 중복/이미지 badge

**Files:**
- Create: `pj/components/FilterBar.jsx`
- Modify: `pj/components/RequirementList.jsx`
- Modify: `pj/app/requirements/page.js`

- [ ] **Step 1: 필터 바 컴포넌트 작성**

Create `pj/components/FilterBar.jsx`:

```jsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PRIORITIES = ['상', '중', '하'];

// props: teamMembers[], categories[], value{assignee,category,priority}, onChange(patch)
export function FilterBar({ teamMembers, categories, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        placeholder="담당자"
        options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
        current={value.assignee}
        onPick={(v) => onChange({ assignee: v })}
      />
      <FilterSelect
        placeholder="카테고리"
        options={categories.map((c) => ({ value: c.id, label: c.category_name }))}
        current={value.category}
        onPick={(v) => onChange({ category: v })}
      />
      <FilterSelect
        placeholder="우선순위"
        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
        current={value.priority}
        onPick={(v) => onChange({ priority: v })}
      />
      {(value.assignee || value.category || value.priority) && (
        <button
          type="button"
          onClick={() => onChange({ assignee: '', category: '', priority: '' })}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}

function FilterSelect({ placeholder, options, current, onPick }) {
  return (
    <Select
      items={options}
      value={current || null}
      onValueChange={onPick}
    >
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: `RequirementList`에 중복 muted + 이미지 배지 + 행 클릭**

`pj/components/RequirementList.jsx` 전체를 다음으로 교체:

```jsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const STATUS_STYLES = {
  대기: 'bg-slate-100 text-slate-600',
  요청: 'bg-slate-100 text-slate-600',
  검토: 'bg-amber-50 text-amber-700',
  정책정의: 'bg-amber-50 text-amber-700',
  진행중: 'bg-indigo-50 text-indigo-700',
  완료: 'bg-emerald-50 text-emerald-700',
  중복: 'bg-slate-100 text-slate-400',
};
const DEFAULT_STATUS_STYLE = 'bg-slate-100 text-slate-600';

function StatusBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE}>{status}</Badge>;
}

function ConfidentialBadge() {
  return <Badge className="bg-rose-50 text-rose-600">비공개</Badge>;
}

function Meta({ req }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
      {req.is_confidential && <ConfidentialBadge />}
      {req.image_count > 0 && <span>📎 {req.image_count}</span>}
      {req.status === '중복' && <span>→ 병합됨</span>}
    </span>
  );
}

export function RequirementList({ requirements }) {
  if (requirements.length === 0) {
    return <p className="text-sm text-slate-500">등록된 요구사항이 없습니다.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
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
              <tr
                key={req.id}
                className={`border-t border-slate-200 hover:bg-slate-50 ${
                  req.status === '중복' ? 'opacity-60' : ''
                }`}
              >
                <td className="p-2 text-slate-600">{req.request_date}</td>
                <td className="p-2">
                  <StatusBadge status={req.status} />
                </td>
                <td className="p-2 text-slate-600">{req.category?.category_name ?? '-'}</td>
                <td className="p-2 text-slate-900">
                  <Link href={`/requirements/${req.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                    {req.title}
                  </Link>
                  <span className="ml-1.5">
                    <Meta req={req} />
                  </span>
                </td>
                <td className="p-2 text-slate-600">{req.requester?.name ?? '-'}</td>
                <td className="p-2 text-slate-600">{req.priority ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {requirements.map((req) => (
          <Link
            key={req.id}
            href={`/requirements/${req.id}`}
            className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
              req.status === '중복' ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <StatusBadge status={req.status} />
              <span className="text-xs text-slate-500">{req.request_date}</span>
            </div>
            <p className="mt-2 font-medium text-slate-900">{req.title}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              {req.category?.category_name ?? '-'} · {req.requester?.name ?? '-'}
              <Meta req={req} />
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: 목록 페이지에 필터 바 + 뷰 토글 추가**

`pj/app/requirements/page.js` 전체를 다음으로 교체:

```jsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { canManage } from '@/lib/tiers';
import { RequirementList } from '@/components/RequirementList';
import { RequirementFormDialog } from '@/components/RequirementFormDialog';
import { FilterBar } from '@/components/FilterBar';

export default function RequirementsPage() {
  const { identity } = useIdentity();
  const manage = canManage(identity);
  const [requirements, setRequirements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [filters, setFilters] = useState({ assignee: '', category: '', priority: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function refreshRequirements() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, [identity.brandId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ brandId: identity.brandId, memberId: identity.memberId });
    if (filters.assignee) params.set('assignee', filters.assignee);
    if (filters.category) params.set('category', filters.category);
    if (filters.priority) params.set('priority', filters.priority);
    fetch(`/api/requirements?${params.toString()}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(d.error ?? '요구사항을 불러오지 못했습니다.');
        setRequirements(d.requirements ?? []);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity.brandId, identity.memberId, reloadToken, filters]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">요구사항 목록</h1>
        <div className="flex items-center gap-2">
          {manage && (
            <Link
              href="/requirements/board"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              보드
            </Link>
          )}
          <button
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
          >
            + 새 요구사항
          </button>
        </div>
      </div>

      <FilterBar
        teamMembers={teamMembers}
        categories={categories}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <RequirementList requirements={requirements} />
      )}
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        identity={identity}
        onCreated={refreshRequirements}
      />
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add pj/components/FilterBar.jsx pj/components/RequirementList.jsx pj/app/requirements/page.js
git commit -m "feat: 목록 필터 바 + 보드 링크 + 중복/이미지 badge + 행→상세 링크"
```

---

## Task 20: 칸반 보드 (dnd) + 카드

**Files:**
- Modify: `pj/package.json` (deps 추가)
- Create: `pj/components/RequirementCard.jsx`
- Create: `pj/components/KanbanBoard.jsx`
- Create: `pj/app/requirements/board/page.js`

- [ ] **Step 1: dnd 라이브러리 설치**

Run: `npm install @dnd-kit/core @dnd-kit/utilities`
Expected: `package.json` dependencies에 두 패키지 추가.

- [ ] **Step 2: 카드 컴포넌트 작성**

Create `pj/components/RequirementCard.jsx`:

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

export function RequirementCard({ req, onMerge }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: req.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        req.status === '완료' ? 'opacity-75' : ''
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => onMerge(req)}
            className="text-[11px] text-indigo-600 hover:underline"
          >
            중복처리
          </button>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">
            {req.assignee?.name ? req.assignee.name.slice(0, 2) : '미'}
          </span>
        </div>
      </div>

      <button
        type="button"
        {...listeners}
        {...attributes}
        className="mt-2 w-full cursor-grab rounded bg-slate-50 py-1 text-[11px] text-slate-400"
        aria-label="드래그해서 상태 변경"
      >
        ⋮⋮ 이동
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 보드 컴포넌트 작성**

Create `pj/components/KanbanBoard.jsx`:

```jsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { useIdentity } from '@/components/IdentityProvider';
import { BOARD_STATUSES } from '@/lib/statuses';
import { RequirementCard } from '@/components/RequirementCard';
import { MergeDialog } from '@/components/MergeDialog';

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

export function KanbanBoard() {
  const { identity } = useIdentity();
  const [reqs, setReqs] = useState([]);
  const [error, setError] = useState('');
  const [mergeSource, setMergeSource] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function load() {
    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setReqs(d.requirements ?? []);
        setError('');
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.brandId, identity.memberId]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(BOARD_STATUSES.map((s) => [s, []]));
    for (const r of reqs) {
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
  }, [reqs]);

  async function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id;
    const card = reqs.find((r) => r.id === active.id);
    if (!card || card.status === newStatus || !BOARD_STATUSES.includes(newStatus)) return;

    const prevStatus = card.status;
    setReqs((prev) => prev.map((r) => (r.id === active.id ? { ...r, status: newStatus } : r)));

    const res = await fetch(`/api/requirements/${active.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '상태 변경 실패');
      setReqs((prev) => prev.map((r) => (r.id === active.id ? { ...r, status: prevStatus } : r)));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {BOARD_STATUSES.map((status) => (
            <Column key={status} status={status} items={byStatus[status]}>
              {byStatus[status].map((req) => (
                <RequirementCard key={req.id} req={req} onMerge={setMergeSource} />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
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

- [ ] **Step 4: 보드 페이지 라우트 작성 (3차 차단)**

Create `pj/app/requirements/board/page.js`:

```jsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIdentity } from '@/components/IdentityProvider';
import { canManage } from '@/lib/tiers';
import { KanbanBoard } from '@/components/KanbanBoard';

export default function BoardPage() {
  const { identity } = useIdentity();
  const router = useRouter();
  const manage = canManage(identity);

  useEffect(() => {
    if (!manage) router.replace('/requirements');
  }, [manage, router]);

  if (!manage) return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">요구사항 보드</h1>
      <KanbanBoard />
    </div>
  );
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully` (MergeDialog는 다음 Task에서 만들지만, 이 Task를 먼저 커밋하지 말고 Task 21까지 이어서 완료한 뒤 빌드한다).

주의: `KanbanBoard`가 `MergeDialog`를 import하므로 Task 21을 완료해야 빌드가 통과한다.
Task 20 Step 5의 빌드는 건너뛰고 Task 21에서 함께 빌드/커밋한다.

- [ ] **Step 6: (커밋은 Task 21과 함께)**

이 Task의 파일은 스테이징만 해두고 Task 21에서 함께 커밋한다:

```bash
git add pj/package.json pj/package-lock.json pj/components/RequirementCard.jsx pj/components/KanbanBoard.jsx "pj/app/requirements/board/page.js"
```

---

## Task 21: 중복처리 모달 (`MergeDialog`)

**Files:**
- Create: `pj/components/MergeDialog.jsx`

- [ ] **Step 1: 모달 컴포넌트 작성**

Create `pj/components/MergeDialog.jsx`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useIdentity } from '@/components/IdentityProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// props: source(req), onClose(), onMerged()
export function MergeDialog({ source, onClose, onMerged }) {
  const { identity } = useIdentity();
  const [candidates, setCandidates] = useState([]);
  const [allReqs, setAllReqs] = useState([]);
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/requirements/${source.id}/similar?memberId=${identity.memberId}&brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCandidates(d.candidates ?? []))
      .catch(() => {});
    fetch(`/api/requirements?brandId=${identity.brandId}&memberId=${identity.memberId}`)
      .then((res) => res.json())
      .then((d) => setAllReqs((d.requirements ?? []).filter((r) => r.id !== source.id && r.status !== '중복')))
      .catch(() => {});
  }, [source.id, identity.memberId, identity.brandId]);

  const searchResults = search
    ? allReqs.filter((r) => r.title.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function doMerge() {
    if (!targetId) return;
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/requirements/${source.id}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, brandId: identity.brandId, targetId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? '병합 실패');
      return;
    }
    onMerged();
  }

  const targetTitle =
    candidates.find((c) => c.id === targetId)?.title ??
    allReqs.find((r) => r.id === targetId)?.title ??
    '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>중복 처리</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-slate-500">
            &lsquo;{source.title}&rsquo; 을(를) 아래 기존 요청에 병합합니다.
          </p>

          {error && <p className="text-red-600">{error}</p>}

          <div>
            <p className="mb-1 font-medium text-slate-700">유사 후보</p>
            {candidates.length === 0 && <p className="text-slate-400">유사한 요청을 찾지 못했습니다.</p>}
            <ul className="flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === c.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {c.title}{' '}
                    <span className="text-xs text-slate-400">
                      · {c.requester_name ?? '-'} · 유사도 {(c.score * 100).toFixed(0)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-slate-700">직접 검색</p>
            <Input
              placeholder="제목으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="mt-1 flex flex-col gap-1">
              {searchResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(r.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      targetId === r.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {targetId && (
            <p className="rounded bg-amber-50 p-2 text-amber-700">
              &lsquo;{targetTitle}&rsquo; 에 병합합니다. 되돌릴 수 없습니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={doMerge}
            disabled={!targetId || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? '병합 중...' : '병합'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 빌드 확인 (Task 20 + 21 합산)**

Run: `npm run build`
Expected: `Compiled successfully` (보드/카드/모달 모두 컴파일).

- [ ] **Step 3: Commit (Task 20 파일 + MergeDialog 함께)**

```bash
git add pj/components/MergeDialog.jsx
git commit -m "feat: 칸반 보드(dnd) + 카드 + 중복처리 모달(유사 후보 + 검색)"
```

---

## Task 22: TopBar 보드 링크 (tier 게이팅)

**Files:**
- Modify: `pj/components/TopBar.jsx`

- [ ] **Step 1: TopBar에 보드 링크 추가**

`pj/components/TopBar.jsx` 전체를 다음으로 교체:

```jsx
'use client';

import Link from 'next/link';
import { useIdentity } from './IdentityProvider';
import { canManage } from '@/lib/tiers';

export function TopBar() {
  const { identity, switchUser } = useIdentity();
  const manage = canManage(identity);
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
      </div>
      <button onClick={switchUser} className="text-sm text-slate-500 underline hover:text-slate-700">
        다른 사용자로 전환
      </button>
    </header>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add pj/components/TopBar.jsx
git commit -m "feat: TopBar에 목록/보드 내비게이션(보드는 2차 이상만)"
```

---

## Task 23: 브라우저 통합 검증

**Files:** (없음 — 실제 브라우저 검증)

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm run test && npm run lint && npm run build`
Expected: 테스트 전부 PASS, lint 0 error, 빌드 성공.

- [ ] **Step 2: dev 서버로 시나리오 검증**

Run: `npm run dev` (preview 도구 사용). 다음을 순서대로 확인:

1. **진입 → tier 저장**: 2차 사용자(예: 시드의 브랜드 2차 관리자)로 진입 → localStorage
   `requirements-app-identity`에 `tier` 포함 확인.
2. **등록 + 이미지**: "+ 새 요구사항" → 제목 입력 → 이미지 드롭존에 (a) 파일 선택,
   (b) 스크린샷 Ctrl+V 붙여넣기로 1~2장 추가 → 등록 → 목록에서 📎 배지 확인.
3. **상세**: 제목 클릭 → 상세 진입 → 이미지 갤러리에 방금 올린 이미지가 서명 URL로 보임
   → 이미지 삭제 동작 확인 → 활동 타임라인 확인.
4. **보드 상태 변경**: TopBar "보드" → 카드를 '대기'에서 '진행중' 컬럼으로 드래그 →
   상태 반영 확인 → 다시 로드해도 유지. '완료'로 옮긴 뒤 상세에서 완료 시각 반영 확인.
5. **드래그 실패 롤백**: (선택) 네트워크 차단 상태에서 드래그 → 원위치로 롤백 + 에러 확인.
6. **중복 병합**: 비슷한 제목의 요구사항 2개 생성 → 보드 카드 "중복처리" → 유사 후보에
   나타나는지 확인 → 병합 → 소스가 목록에서 '중복' muted + "→ 병합됨"으로 보이고,
   대상 상세의 "이 요청에 병합된 요청"에 소스가 뜨는지 확인.
7. **필터 바**: 담당자/카테고리/우선순위 필터가 목록을 거르는지 확인.
8. **3차 게이팅**: 3차 사용자로 전환 → TopBar에 "보드" 링크 없음, `/requirements/board`
   직접 접근 시 목록으로 리다이렉트, 비공개 건 상세 URL 직접 접근 시 403 확인.

- [ ] **Step 3: 최종 커밋 (검증 노트, 필요 시)**

검증 중 수정이 없었다면 별도 커밋 불필요. 수정이 있었다면 해당 파일별로 커밋한다.

---

## 자체 점검 결과 (Self-Review)

- **스펙 커버리지**: 칸반 보드(Task 20) · 필터/뷰토글(Task 19) · 상세(Task 18) · 상태변경(API Task 11, UI 보드 Task 20 + 상세 사이드바 Task 18) · 담당자 지정(API Task 12, UI 상세 사이드바 Task 18) · 중복병합(Task 13·21) · 유사후보(Task 14) · identity tier(Task 6·7) · 이미지 첨부(Task 15·16·17, 상세 갤러리 Task 18) · 마이그레이션/스토리지(Task 1) · badge/muted(Task 19) — 스펙 각 항목에 대응 태스크 존재.
  - 참고: 스펙의 "보드 카드 ⋮ 메뉴에서 담당자 지정"은 담당자 변경 UI를 **상세 사이드바 드롭다운**으로 일원화했다(카드에는 중복처리 버튼 + 상세 링크만; 담당자 변경은 상세에서). API 계약은 동일해 추후 카드 메뉴로 확장 가능.
- **타입/이름 일관성**: identity 형태(`{...,tier}`), 목록 아이템(`image_count`, `assignee`), 상세 응답(`requirement/history/duplicates/mergedInto/images`), `canManage`, `BOARD_STATUSES`/`MERGED_STATUS`/`DONE_STATUS`, `validateMerge`/`computeCompletedAt`/`validateImageUpload` 시그니처가 정의 태스크와 사용 태스크 간 일치.
- **주의**: Task 20의 `KanbanBoard`가 Task 21의 `MergeDialog`를 import하므로, Task 20은 빌드/커밋을 보류하고 Task 21에서 함께 빌드·커밋한다(Task 20 Step 6에서 스테이징만).
