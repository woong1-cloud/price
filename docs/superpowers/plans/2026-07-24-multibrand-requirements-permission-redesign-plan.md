# 권한 구조 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브랜드 내부 권한을 2단계(2차/3차)에서 4단계(1차/2차/3차/4차)로 확장하고, 요구사항 내용 수정 기능과 전체관리자 지정/해제 화면을 추가한다.

**Architecture:** `user_brand_roles.tier`를 4개 값으로 확장하는 마이그레이션(기존 3차→4차 이전) + `lib/tiers.js`의 게이팅 함수 분리(`canProcess`/`canManageBrand`) + 기존 API들의 `minTier` 문자열 일괄 조정 + 신규 콘텐츠 수정 API/컴포넌트 + 전체관리자 토글(마지막 1명 보호 포함).

**Tech Stack:** Next.js 16(App Router, JS) + React 19 + Tailwind v4 + Supabase(Postgres) + Vitest.

**참고 스펙:** `docs/superpowers/specs/2026-07-24-multibrand-requirements-permission-redesign-design.md`

**테스트 전략 (기존 관례와 동일):** 순수 로직만 Vitest로 TDD. API 라우트와 UI는 `npm run lint`로 구문 오류를 확인한 뒤 마지막 태스크에서 브라우저로 전체 플로우를 검증한다.

**작업 위치:** 모든 파일 경로는 `pj/` 기준 상대 경로다.

---

## 파일 구조

**신규 생성**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0004_permission_redesign.sql` | tier 4단계 확장 + 기존 3차→4차 이전 |
| `lib/checkLastGlobalAdmin.js` | "마지막 활성 전체관리자인가" 순수 판정 함수 |
| `lib/checkLastGlobalAdmin.test.js` | 위 함수 단위 테스트 |
| `components/RequirementEditForm.jsx` | 요구사항 내용 수정 폼(상세 화면에 인라인으로 표시) |

**수정**

| 파일 | 변경 내용 |
|---|---|
| `lib/tiers.js` | `TIER_RANK`/`TIER_LABELS` 4단계로 확장, `canManage` → `canProcess`+`canManageBrand`로 분리 |
| `lib/tiers.test.js` | `canProcess`/`canManageBrand` 테스트 추가 |
| `app/api/requirements/route.js` | GET/POST의 minTier `'3차'`→`'4차'`, 비공개 문턱 `'2차'`→`'3차'` |
| `app/api/requirements/[id]/route.js` | GET의 비공개 문턱 조정 + **PATCH(내용수정) 신규 추가** |
| `app/api/requirements/[id]/status/route.js` | minTier `'2차'`→`'3차'` |
| `app/api/requirements/[id]/assignee/route.js` | minTier `'2차'`→`'3차'` |
| `app/api/requirements/[id]/merge/route.js` | minTier `'2차'`→`'3차'` |
| `app/api/requirements/[id]/similar/route.js` | minTier `'2차'`→`'3차'` |
| `app/api/team-members/[id]/route.js` | `isGlobalAdmin` 필드 추가 + 마지막 전체관리자 보호 |
| `components/TopBar.jsx` | "보드"는 `canProcess`, "설정"은 `canManageBrand` 기준으로 분리 게이팅 |
| `app/requirements/page.js` | 목록 화면의 "보드" 링크 게이트를 `canProcess`로 교체 |
| `app/requirements/board/page.js` | 게이트를 `canProcess`로 교체 |
| `app/requirements/settings/page.js` | 게이트를 `canManageBrand`로 교체 |
| `components/RequirementDetail.jsx` | 상태·담당자 컨트롤 게이트를 `canProcess`로 교체, "수정" 버튼 + 편집모드 추가 |
| `components/BrandTeamSection.jsx` | tier 선택지 `['2차','3차']` → `['3차','4차']` |
| `components/BrandTeamAssignDialog.jsx` | tier 선택지 및 기본값 `['2차','3차']`/`'3차'` → `['3차','4차']`/`'4차'` |
| `app/admin/brands/page.js` | 팀원 섹션에 전체관리자 지정/해제 토글 + 배지 추가 |

---

## Task 1: 마이그레이션 0004 — tier 4단계 확장

**Files:**
- Create: `supabase/migrations/0004_permission_redesign.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql ~ 0003_phase3.sql 실행 이후)

alter table user_brand_roles drop constraint if exists user_brand_roles_tier_check;
alter table user_brand_roles add constraint user_brand_roles_tier_check
  check (tier in ('2차','3차','4차'));

-- 기존 3차(구 "요청자" 의미)를 4차로 옮겨서 '3차'를 새 의미(실무자)로 비워둔다.
update user_brand_roles set tier = '4차' where tier = '3차';
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

이 프로젝트는 자동 마이그레이션 러너가 없다 — 위 내용을 Supabase SQL Editor에 붙여넣어
직접 실행한다(0001~0003과 동일한 방식). **실행 전에 계속 처리 권한이 필요한 기존 팀원
목록을 파악해 둘 것** — 실행 즉시 그들의 tier가 4차(요청자)로 바뀌므로, 실행 후 브랜드
설정 화면에서 수동으로 3차로 재지정해야 한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0004_permission_redesign.sql
git commit -m "$(cat <<'EOF'
feat: 브랜드 권한 등급을 4단계(1~4차)로 확장하는 마이그레이션 추가

EOF
)"
```

---

## Task 2: `lib/tiers.js` — 4단계 등급 + `canProcess`/`canManageBrand` (TDD)

**Files:**
- Modify: `lib/tiers.js`
- Modify: `lib/tiers.test.js`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/tiers.test.js`에 기존 `isGlobalAdmin` describe 블록은 그대로 두고, 파일 하단에
아래를 추가한다:

```js
import { canManageBrand, canProcess } from './tiers';
```

(주의: 위 import는 파일 최상단 기존 `import { isGlobalAdmin } from './tiers';` 줄과
합쳐서 `import { canManageBrand, canProcess, isGlobalAdmin } from './tiers';` 한 줄로
정리한다.)

```js
describe('canProcess', () => {
  it('1차는 true', () => {
    expect(canProcess({ isGlobalAdmin: true, tier: '1차' })).toBe(true);
  });
  it('2차는 true', () => {
    expect(canProcess({ tier: '2차' })).toBe(true);
  });
  it('3차(실무자)는 true', () => {
    expect(canProcess({ tier: '3차' })).toBe(true);
  });
  it('4차(요청자)는 false', () => {
    expect(canProcess({ tier: '4차' })).toBe(false);
  });
  it('identity가 없으면 false', () => {
    expect(canProcess(undefined)).toBe(false);
  });
});

describe('canManageBrand', () => {
  it('1차는 true', () => {
    expect(canManageBrand({ isGlobalAdmin: true, tier: '1차' })).toBe(true);
  });
  it('2차는 true', () => {
    expect(canManageBrand({ tier: '2차' })).toBe(true);
  });
  it('3차(실무자)는 false', () => {
    expect(canManageBrand({ tier: '3차' })).toBe(false);
  });
  it('4차(요청자)는 false', () => {
    expect(canManageBrand({ tier: '4차' })).toBe(false);
  });
  it('identity가 없으면 false', () => {
    expect(canManageBrand(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/tiers.test.js`
Expected: FAIL — `canProcess`/`canManageBrand`가 export되지 않음

- [ ] **Step 3: `lib/tiers.js`를 아래 내용으로 전체 교체**

```js
export const TIER_RANK = { '4차': 1, '3차': 2, '2차': 3, '1차': 4 };

// 저장값(1차/2차/3차/4차)은 그대로 두고 화면 표시 문구만 사용자 친화적으로 바꾼다.
export const TIER_LABELS = {
  '1차': '전체 관리자',
  '2차': '브랜드 관리자',
  '3차': '실무자',
  '4차': '요청자',
};

// 요구사항 처리(상태변경/내용수정/담당자지정) 가능 여부. 1차/2차/3차.
export function canProcess(identity) {
  if (identity?.isGlobalAdmin === true) return true;
  return identity?.tier === '1차' || identity?.tier === '2차' || identity?.tier === '3차';
}

// 브랜드 운영 관리(팀원 배치/카테고리 관리) 가능 여부. 1차/2차.
export function canManageBrand(identity) {
  if (identity?.isGlobalAdmin === true) return true;
  return identity?.tier === '1차' || identity?.tier === '2차';
}

export function isGlobalAdmin(identity) {
  return identity?.isGlobalAdmin === true;
}
```

(기존 `canManage` export는 삭제한다 — 이 플랜의 이후 태스크에서 모든 호출부를
`canProcess`/`canManageBrand`로 교체하므로 더 이상 쓰이지 않는다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/tiers.test.js`
Expected: PASS (isGlobalAdmin 4개 + canProcess 5개 + canManageBrand 5개 = 14개)

- [ ] **Step 5: 커밋**

```bash
git add lib/tiers.js lib/tiers.test.js
git commit -m "$(cat <<'EOF'
feat: 권한 등급 4단계 확장 + canProcess/canManageBrand로 게이팅 분리

EOF
)"
```

**주의:** 이 커밋 시점에는 아직 `canManage`를 쓰던 다른 파일들이 고쳐지지 않아 빌드가
깨진다. 이 태스크는 `npm run lint`만 확인하고(다른 파일의 `canManage` import 에러는
이후 태스크에서 해소됨), 전체 빌드 확인은 마지막 통합 검증 태스크에서 한다.

---

## Task 3: `checkLastGlobalAdmin` 순수 함수 (TDD)

**Files:**
- Create: `lib/checkLastGlobalAdmin.js`
- Create: `lib/checkLastGlobalAdmin.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// lib/checkLastGlobalAdmin.test.js
import { describe, expect, it } from 'vitest';
import { checkLastGlobalAdmin } from './checkLastGlobalAdmin';

describe('checkLastGlobalAdmin', () => {
  it('유일한 활성 전체관리자이면 true', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: true, is_active: true }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(true);
  });

  it('다른 활성 전체관리자가 더 있으면 false', () => {
    const teamMembers = [
      { id: 'm1', is_global_admin: true, is_active: true },
      { id: 'm2', is_global_admin: true, is_active: true },
    ];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('대상이 애초에 전체관리자가 아니면 false', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: false, is_active: true }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('대상이 이미 비활성 상태면 false(보호 대상 아님)', () => {
    const teamMembers = [{ id: 'm1', is_global_admin: true, is_active: false }];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(false);
  });

  it('다른 전체관리자가 있어도 비활성이면 카운트에서 제외되어 true', () => {
    const teamMembers = [
      { id: 'm1', is_global_admin: true, is_active: true },
      { id: 'm2', is_global_admin: true, is_active: false },
    ];
    expect(checkLastGlobalAdmin({ teamMembers, targetMemberId: 'm1' })).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run lib/checkLastGlobalAdmin.test.js`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현**

```js
// lib/checkLastGlobalAdmin.js
export function checkLastGlobalAdmin({ teamMembers, targetMemberId }) {
  const target = teamMembers.find((m) => m.id === targetMemberId);
  if (!target || !target.is_global_admin || !target.is_active) return false;

  const activeAdminCount = teamMembers.filter((m) => m.is_global_admin && m.is_active).length;
  return activeAdminCount <= 1;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/checkLastGlobalAdmin.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/checkLastGlobalAdmin.js lib/checkLastGlobalAdmin.test.js
git commit -m "$(cat <<'EOF'
feat: 마지막 전체관리자 판정용 checkLastGlobalAdmin 추가

EOF
)"
```

---

## Task 4: 기존 요구사항 API의 최소 등급 조정

**Files:**
- Modify: `app/api/requirements/route.js`
- Modify: `app/api/requirements/[id]/status/route.js`
- Modify: `app/api/requirements/[id]/assignee/route.js`
- Modify: `app/api/requirements/[id]/merge/route.js`
- Modify: `app/api/requirements/[id]/similar/route.js`

로직 변경 없이 `requireBrandAccess(..., minTier)` 호출의 문자열과 `TIER_RANK[...]`
비교 기준만 바꾼다.

- [ ] **Step 1: `app/api/requirements/route.js`**

`GET` 함수 안:
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '3차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];
```
을 아래로 교체:
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '4차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
```

`POST` 함수 안:
```js
    const { isGlobalAdmin, tier } = await requireBrandAccess(memberId, brandId, '3차');
    const canSetConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];
```
을 아래로 교체:
```js
    const { isGlobalAdmin, tier } = await requireBrandAccess(memberId, brandId, '4차');
    const canSetConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
```

- [ ] **Step 2: `app/api/requirements/[id]/status/route.js`**

```js
    await requireBrandAccess(memberId, brandId, '2차');
```
을
```js
    await requireBrandAccess(memberId, brandId, '3차');
```
로 교체.

- [ ] **Step 3: `app/api/requirements/[id]/assignee/route.js`**

동일하게 `requireBrandAccess(memberId, brandId, '2차')` → `requireBrandAccess(memberId, brandId, '3차')`.

- [ ] **Step 4: `app/api/requirements/[id]/merge/route.js`**

동일하게 `requireBrandAccess(memberId, brandId, '2차')` → `requireBrandAccess(memberId, brandId, '3차')`.

- [ ] **Step 5: `app/api/requirements/[id]/similar/route.js`**

동일하게 `requireBrandAccess(memberId, brandId, '2차')` → `requireBrandAccess(memberId, brandId, '3차')`.

- [ ] **Step 6: 린트 확인 + 커밋**

```bash
npm run lint
git add app/api/requirements/route.js app/api/requirements/[id]/status/route.js app/api/requirements/[id]/assignee/route.js app/api/requirements/[id]/merge/route.js app/api/requirements/[id]/similar/route.js
git commit -m "$(cat <<'EOF'
feat: 요구사항 API들의 최소 등급을 새 4단계 체계에 맞게 조정

EOF
)"
```

---

## Task 5: 요구사항 내용 수정 API

**Files:**
- Modify: `app/api/requirements/[id]/route.js`

- [ ] **Step 1: 기존 GET의 비공개 문턱 조정**

파일 상단 import에 `DONE_STATUS`를 추가한다:
```js
import { MERGED_STATUS } from '@/lib/statuses';
```
을
```js
import { DONE_STATUS, MERGED_STATUS } from '@/lib/statuses';
```
로 교체.

`GET` 함수 안:
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, requirement.brand_id, '3차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차'];
```
을
```js
    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, requirement.brand_id, '4차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
```
로 교체.

- [ ] **Step 2: `PATCH` 함수 추가**

파일 맨 아래에 추가:

```js
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, brandId, title, priority, urgency, category, asIs, toBe, note, isConfidential } = body;
    if (!memberId || !brandId) throw new ApiError(400, 'memberId와 brandId가 필요합니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(memberId, brandId, '4차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id, status, requester')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');
    if (current.status === DONE_STATUS || current.status === MERGED_STATUS) {
      throw new ApiError(400, '완료되었거나 병합된 요구사항은 수정할 수 없습니다.');
    }

    const canProcess = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
    const isOwner = current.requester === memberId;
    if (!canProcess && !isOwner) {
      throw new ApiError(403, '수정 권한이 없습니다.');
    }

    const FIELD_LABELS = {
      title: '제목',
      priority: '우선순위',
      urgency: '긴급도',
      category: '카테고리',
      asIs: 'As-Is',
      toBe: 'To-Be',
      note: '비고',
      isConfidential: '비공개여부',
    };
    const updates = {};
    const changedFields = [];
    if (title !== undefined) {
      if (!title.trim()) throw new ApiError(400, '제목은 필수입니다.');
      updates.title = title.trim();
      changedFields.push(FIELD_LABELS.title);
    }
    if (priority !== undefined) {
      updates.priority = priority || null;
      changedFields.push(FIELD_LABELS.priority);
    }
    if (urgency !== undefined) {
      updates.urgency = urgency || null;
      changedFields.push(FIELD_LABELS.urgency);
    }
    if (category !== undefined) {
      updates.category = category || null;
      changedFields.push(FIELD_LABELS.category);
    }
    if (asIs !== undefined) {
      updates.as_is = asIs || null;
      changedFields.push(FIELD_LABELS.asIs);
    }
    if (toBe !== undefined) {
      updates.to_be = toBe || null;
      changedFields.push(FIELD_LABELS.toBe);
    }
    if (note !== undefined) {
      updates.note = note || null;
      changedFields.push(FIELD_LABELS.note);
    }
    if (isConfidential !== undefined && canProcess) {
      updates.is_confidential = Boolean(isConfidential);
      changedFields.push(FIELD_LABELS.isConfidential);
    }

    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    updates.updated_at = new Date().toISOString();
    const { data, error: updError } = await supabase
      .from('requirements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (updError) throw updError;

    const { error: logError } = await supabase.from('change_logs').insert({
      requirement_id: id,
      brand_id: brandId,
      changed_by: memberId,
      change_type: '내용수정',
      comment: `${changedFields.join(', ')} 수정`,
    });
    if (logError) throw logError;

    return Response.json({ requirement: data });
  } catch (error) {
    return errorResponse(error);
  }
}
```

## Context

`isConfidential`은 `canProcess`(3차 이상)를 만족할 때만 실제로 반영되고, 4차 본인 수정
케이스에서 이 필드를 같이 보내도 조용히 무시된다(나머지 필드는 정상 반영) — 부분 수정
API의 일반 원칙. `완료`/`중복` 상태는 상태변경 API와 동일한 원칙으로 잠긴다.

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add "app/api/requirements/[id]/route.js"
git commit -m "$(cat <<'EOF'
feat: 요구사항 내용 수정 API(PATCH) 추가

EOF
)"
```

---

## Task 6: `PATCH /api/team-members/[id]` — 전체관리자 지정/해제 + 보호

**Files:**
- Modify: `app/api/team-members/[id]/route.js`

- [ ] **Step 1: 파일을 아래 내용으로 전체 교체**

```js
// app/api/team-members/[id]/route.js
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGlobalAdmin } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { checkLastGlobalAdmin } from '@/lib/checkLastGlobalAdmin';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { memberId, name, isActive, isGlobalAdmin } = body;
    if (!memberId) throw new ApiError(400, 'memberId가 필요합니다.');

    await requireGlobalAdmin(memberId);

    const supabase = getSupabaseAdmin();

    if (isGlobalAdmin === false || isActive === false) {
      const { data: teamMembers, error: listError } = await supabase
        .from('team_members')
        .select('id, is_global_admin, is_active');
      if (listError) throw listError;
      if (checkLastGlobalAdmin({ teamMembers, targetMemberId: id })) {
        throw new ApiError(400, '이 시스템의 마지막 전체 관리자는 해제할 수 없습니다.');
      }
    }

    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, '이름은 필수입니다.');
      updates.name = name.trim();
    }
    if (isActive !== undefined) updates.is_active = isActive;
    if (isGlobalAdmin !== undefined) updates.is_global_admin = isGlobalAdmin;
    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

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

## Context

`isGlobalAdmin: false`(명시적 해제) 또는 `isActive: false`(계정 비활성화 — 결과적으로
전체관리자를 잃는 것과 같은 효과)일 때 모두 마지막 전체관리자 보호 검사를 돌린다.
대상이 애초에 전체관리자가 아니면 `checkLastGlobalAdmin`이 즉시 `false`를 반환하므로
일반 팀원을 비활성화할 때는 이 검사가 실질적으로 아무 영향을 주지 않는다.

- [ ] **Step 2: 린트 확인 + 커밋**

```bash
npm run lint
git add "app/api/team-members/[id]/route.js"
git commit -m "$(cat <<'EOF'
feat: 전체관리자 지정/해제 API + 마지막 전체관리자 보호 추가

EOF
)"
```

---

## Task 7: TopBar / 목록 / 보드 / 설정 페이지 게이팅 교체

**Files:**
- Modify: `components/TopBar.jsx`
- Modify: `app/requirements/page.js`
- Modify: `app/requirements/board/page.js`
- Modify: `app/requirements/settings/page.js`

- [ ] **Step 1: `components/TopBar.jsx`**

```jsx
import { canManage, isGlobalAdmin } from '@/lib/tiers';
```
을
```jsx
import { canProcess, canManageBrand, isGlobalAdmin } from '@/lib/tiers';
```
로 교체.

```jsx
  const manage = canManage(identity);
```
을
```jsx
  const processAllowed = canProcess(identity);
  const manageBrand = canManageBrand(identity);
```
로 교체.

```jsx
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
```
을
```jsx
        {processAllowed && (
          <Link href="/requirements/board" className="text-slate-500 hover:text-slate-700">
            보드
          </Link>
        )}
        {manageBrand && (
          <Link href="/requirements/settings" className="text-slate-500 hover:text-slate-700">
            설정
          </Link>
        )}
```
로 교체.

- [ ] **Step 2: `app/requirements/page.js`**

이 파일은 목록 화면 자체에도 "보드" 링크가 하나 더 있다(TopBar와 별개).
```jsx
import { canManage } from '@/lib/tiers';
```
을
```jsx
import { canProcess } from '@/lib/tiers';
```
로 교체.
```jsx
  const manage = canManage(identity);
```
을
```jsx
  const processAllowed = canProcess(identity);
```
로 교체. 그리고 `{manage && (` 로 시작하는 "보드" `<Link>` 블록의 `manage`를
`processAllowed`로 교체한다.

- [ ] **Step 3: `app/requirements/board/page.js`**

```jsx
import { canManage } from '@/lib/tiers';
```
을
```jsx
import { canProcess } from '@/lib/tiers';
```
로, 그리고
```jsx
  const manage = canManage(identity);

  useEffect(() => {
    if (!manage) router.replace('/requirements');
  }, [manage, router]);

  if (!manage) return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
```
을
```jsx
  const processAllowed = canProcess(identity);

  useEffect(() => {
    if (!processAllowed) router.replace('/requirements');
  }, [processAllowed, router]);

  if (!processAllowed) return <p className="text-sm text-slate-500">권한이 없습니다. 목록으로 이동합니다...</p>;
```
로 교체.

- [ ] **Step 4: `app/requirements/settings/page.js`**

```jsx
import { canManage } from '@/lib/tiers';
```
을
```jsx
import { canManageBrand } from '@/lib/tiers';
```
로 교체. 그리고 파일 안의 `manage` 변수 사용을 전부 `manageBrand`로 바꾼다:
```jsx
  const manage = canManage(identity);
```
→
```jsx
  const manageBrand = canManageBrand(identity);
```
이 파일에서 `manage`가 쓰이는 나머지 3곳(`useEffect(() => { if (!manage) ... })`,
두 번째 `useEffect`의 `if (!manage) return undefined;`와 의존성 배열의 `manage`,
그리고 `if (!manage) { return <p>...</p>; }`)도 전부 `manageBrand`로 교체한다.

- [ ] **Step 5: 린트 확인 + 커밋**

```bash
npm run lint
git add components/TopBar.jsx app/requirements/page.js app/requirements/board/page.js app/requirements/settings/page.js
git commit -m "$(cat <<'EOF'
feat: 보드/설정 게이팅을 canProcess/canManageBrand로 분리

EOF
)"
```

---

## Task 8: `RequirementDetail` 게이팅 교체

**Files:**
- Modify: `components/RequirementDetail.jsx`

- [ ] **Step 1: import 교체**

```jsx
import { canManage } from '@/lib/tiers';
```
을
```jsx
import { canProcess } from '@/lib/tiers';
```
로 교체.

- [ ] **Step 2: 변수명 교체**

```jsx
  const manage = canManage(identity);
```
을
```jsx
  const processAllowed = canProcess(identity);
```
로 교체하고, 파일 안에서 상태/담당자 컨트롤 노출에 쓰이던 `manage ? (...) : (...)` 두
군데(상태, 담당자 섹션)를 전부 `processAllowed ? (...) : (...)`로 교체한다.

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add components/RequirementDetail.jsx
git commit -m "$(cat <<'EOF'
feat: 요구사항 상세 화면의 상태/담당자 컨트롤 게이팅을 canProcess로 교체

EOF
)"
```

---

## Task 9: `RequirementEditForm` 컴포넌트 + 상세 화면 연결

**Files:**
- Create: `components/RequirementEditForm.jsx`
- Modify: `components/RequirementDetail.jsx`

- [ ] **Step 1: `RequirementEditForm.jsx` 작성**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LEVELS = ['상', '중', '하'];
const LEVEL_STYLE = {
  상: { on: 'border-rose-300 bg-rose-50 text-rose-600', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
  중: { on: 'border-amber-300 bg-amber-50 text-amber-700', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
  하: { on: 'border-slate-300 bg-slate-100 text-slate-600', off: 'border-slate-200 text-slate-400 hover:bg-slate-50' },
};

function LevelSelect({ id, value, onChange }) {
  return (
    <div id={id} className="flex gap-1.5">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(value === level ? '' : level)}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
            value === level ? LEVEL_STYLE[level].on : LEVEL_STYLE[level].off
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

// props: requirement(현재 값), canSetConfidential, identity, onSaved(updatedRequirement), onCancel()
export function RequirementEditForm({ requirement, canSetConfidential, identity, onSaved, onCancel }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    title: requirement.title ?? '',
    priority: requirement.priority ?? '',
    urgency: requirement.urgency ?? '',
    category: requirement.category?.id ?? 'none',
    asIs: requirement.as_is ?? '',
    toBe: requirement.to_be ?? '',
    note: requirement.note ?? '',
    isConfidential: requirement.is_confidential ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/brand-categories?brandId=${identity.brandId}`)
      .then((res) => res.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, [identity.brandId]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/requirements/${requirement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: identity.memberId,
          brandId: identity.brandId,
          title: form.title,
          priority: form.priority || null,
          urgency: form.urgency || null,
          category: form.category === 'none' ? null : form.category,
          asIs: form.asIs,
          toBe: form.toBe,
          note: form.note,
          isConfidential: form.isConfidential,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '수정에 실패했습니다.');
      onSaved(data.requirement);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4"
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-title">제목</Label>
        <Input id="edit-title" value={form.title} onChange={(e) => updateField('title', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-priority">우선순위</Label>
          <LevelSelect id="edit-priority" value={form.priority} onChange={(v) => updateField('priority', v)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="edit-urgency">긴급도</Label>
          <LevelSelect id="edit-urgency" value={form.urgency} onChange={(v) => updateField('urgency', v)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-category">카테고리</Label>
        <Select
          items={[
            { value: 'none', label: '선택 안 함' },
            ...categories.map((c) => ({ value: c.id, label: c.category_name })),
          ]}
          value={form.category}
          onValueChange={(value) => updateField('category', value)}
        >
          <SelectTrigger id="edit-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">선택 안 함</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.category_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-asIs">As-Is</Label>
        <Textarea id="edit-asIs" value={form.asIs} onChange={(e) => updateField('asIs', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-toBe">To-Be</Label>
        <Textarea id="edit-toBe" value={form.toBe} onChange={(e) => updateField('toBe', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-note">비고</Label>
        <Textarea id="edit-note" value={form.note} onChange={(e) => updateField('note', e.target.value)} />
      </div>
      {canSetConfidential && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-isConfidential"
            checked={form.isConfidential}
            onCheckedChange={(checked) => updateField('isConfidential', Boolean(checked))}
          />
          <Label htmlFor="edit-isConfidential">비공개 요구사항 (브랜드 관리자 이상만 조회 가능)</Label>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          취소
        </Button>
        <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
          {submitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `RequirementDetail.jsx`에 편집 모드 연결**

`components/RequirementDetail.jsx` 상단 import에 추가:
```jsx
import { RequirementEditForm } from '@/components/RequirementEditForm';
import { DONE_STATUS, MERGED_STATUS } from '@/lib/statuses';
```

`export function RequirementDetail({ id })` 함수 안, `const processAllowed = canProcess(identity);` 바로 아래에 상태 추가:
```jsx
  const [editing, setEditing] = useState(false);
```

`if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;` 다음 줄
(`const { requirement: r, history, duplicates, mergedInto, images } = data;` 이후)에
아래 계산을 추가:
```jsx
  const canEdit =
    (processAllowed || r.requester?.id === identity.memberId) &&
    r.status !== DONE_STATUS &&
    r.status !== MERGED_STATUS;
```

제목을 렌더링하는 부분:
```jsx
          <h1 className="text-lg font-semibold text-slate-900">{r.title}</h1>
```
을
```jsx
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-900">{r.title}</h1>
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-indigo-600 hover:underline"
              >
                수정
              </button>
            )}
          </div>
```
로 교체.

As-Is/To-Be/비고 세 `<section>`을 감싸서 편집모드일 때는 `RequirementEditForm`을,
아닐 때는 기존 세 섹션을 보여주도록 바꾼다. 기존:
```jsx
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
```
을
```jsx
          {editing ? (
            <RequirementEditForm
              requirement={r}
              canSetConfidential={processAllowed}
              identity={identity}
              onSaved={() => {
                setEditing(false);
                load();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
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
            </>
          )}
```
로 교체.

마지막으로, 이 컴포넌트가 이력(활동) 섹션에서 `h.change_type === '중복병합'`일 때만
`comment`를 쓰고 그 외에는 전부 "상태를 X→Y로 변경" 문구를 쓰던 부분도 `'내용수정'`을
같이 처리하도록 바꾼다:
```jsx
                {h.changer?.name ?? '누군가'}님이 {h.change_type === '중복병합' ? h.comment : `상태를 ${h.old_value}→${h.new_value}로 변경`}
```
을
```jsx
                {h.changer?.name ?? '누군가'}님이{' '}
                {h.change_type === '내용수정' || h.change_type === '중복병합'
                  ? h.comment
                  : `상태를 ${h.old_value}→${h.new_value}로 변경`}
```
로 교체.

## Context

`canEdit`은 "처리 권한이 있거나(3차 이상) 본인이 작성한 글"이고 "완료/중복이 아닐 때"만
`true`다. 서버(`PATCH /api/requirements/[id]`, Task 5)도 동일한 조건을 재검증하므로
이건 UI 게이팅일 뿐이다. `RequirementEditForm`은 저장 성공 시 `onSaved`로 편집모드를
닫고 `load()`로 상세 데이터를 새로 불러온다(이력 포함).

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add components/RequirementEditForm.jsx components/RequirementDetail.jsx
git commit -m "$(cat <<'EOF'
feat: 요구사항 상세 화면에 내용 수정 기능 연결

EOF
)"
```

---

## Task 10: 브랜드 설정 화면의 tier 선택지 갱신

**Files:**
- Modify: `components/BrandTeamSection.jsx`
- Modify: `components/BrandTeamAssignDialog.jsx`

- [ ] **Step 1: `components/BrandTeamSection.jsx`**

```jsx
const TIERS = ['2차', '3차'];
```
을
```jsx
const TIERS = ['3차', '4차'];
```
로 교체(이 화면에서 배치 가능한 등급은 여전히 브랜드 설정으로 임명 가능한 두 단계만 —
2차/1차는 각각 브랜드 생성 시·전체관리자 토글로만 지정 가능, 이 화면 대상이 아님).

- [ ] **Step 2: `components/BrandTeamAssignDialog.jsx`**

```jsx
const TIERS = ['2차', '3차'];
```
을
```jsx
const TIERS = ['3차', '4차'];
```
로 교체. 그리고 기본 선택값:
```jsx
  const [tier, setTier] = useState('3차');
```
을
```jsx
  const [tier, setTier] = useState('4차');
```
로 교체(새로 배치할 때 기본값은 가장 낮은 권한인 요청자). `wasOpen` 리셋 블록 안의
`setTier('3차');`도 동일하게 `setTier('4차');`로 교체.

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add components/BrandTeamSection.jsx components/BrandTeamAssignDialog.jsx
git commit -m "$(cat <<'EOF'
feat: 브랜드 설정 화면의 tier 선택지를 3차/4차로 갱신

EOF
)"
```

---

## Task 11: `/admin/brands` — 전체관리자 지정/해제 토글

**Files:**
- Modify: `app/admin/brands/page.js`

- [ ] **Step 1: 토글 함수 추가**

`toggleMemberActive` 함수 바로 아래에 추가:
```jsx
  async function toggleGlobalAdmin(member) {
    setActionError('');
    const res = await fetch(`/api/team-members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identity.memberId, isGlobalAdmin: !member.is_global_admin }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '전체관리자 권한 변경 실패');
      return;
    }
    refresh();
  }
```

- [ ] **Step 2: 팀원 테이블에 배지 + 버튼 추가**

```jsx
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2">{m.name}</td>
```
을
```jsx
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2">
                  {m.name}
                  {m.is_global_admin && (
                    <span className="ml-2 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                      전체관리자
                    </span>
                  )}
                </td>
```
로 교체.

```jsx
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleMemberActive(m)} className="text-slate-500 hover:underline">
                    {m.is_active ? '비활성화' : '활성화'}
                  </button>
                </td>
```
을
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
로 교체.

## Context

`GET /api/team-members?includeInactive=true`는 이미 `is_global_admin` 필드를 반환하고
있어(Phase 1부터 존재) 별도 API 수정이 필요 없다. 마지막 전체관리자 보호는 Task 6의
서버 검증이 담당하므로, 이 버튼은 그냥 토글만 보내고 실패 시 `actionError`로 표시한다
(기존 재직여부 토글과 동일한 패턴).

- [ ] **Step 3: 린트 확인 + 커밋**

```bash
npm run lint
git add app/admin/brands/page.js
git commit -m "$(cat <<'EOF'
feat: 브랜드 관리 화면에 전체관리자 지정/해제 토글 추가

EOF
)"
```

---

## Task 12: 전체 단위 테스트 재확인 + 브라우저 통합 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 44개 + `tiers.test.js` 신규 10개 +
`checkLastGlobalAdmin.test.js` 5개 = 59개)

- [ ] **Step 2: 린트 + 빌드 확인**

Run: `npm run lint && npm run build`
Expected: lint 0 errors, build 성공(더 이상 `canManage`를 참조하는 곳이 없어야 함 —
빌드 성공 자체가 그 확인이 된다)

- [ ] **Step 3: 마이그레이션 적용 확인**

Task 1에서 Supabase SQL Editor에 마이그레이션을 이미 적용했는지 확인한다. 아직이면
지금 적용한다.

- [ ] **Step 4: 브라우저 시나리오 — 등급 재배치**

dev 서버(`npm run dev`) 실행 후 브라우저에서:
1. 2차(브랜드 관리자) 계정으로 `/requirements/settings` 진입 → 팀원 배치 표에서 등급이
   전부 "요청자"로 표시되는지 확인(마이그레이션으로 기존 3차가 4차로 이동했으므로).
2. 그중 한 명을 "실무자"로 재지정 → 저장되는지 확인.

- [ ] **Step 5: 브라우저 시나리오 — 등급별 권한**

1. 방금 "실무자"로 올린 계정으로 전환 → TopBar에 "보드"는 보이고 "설정"은 안 보이는지
   확인 → 요구사항 상세에서 상태·담당자 변경 가능한지, 아무 요구사항이나 "수정" 버튼이
   보이고 내용 수정이 되는지 확인.
2. "요청자"(4차) 계정으로 전환 → TopBar에 "보드"도 "설정"도 안 보이는지 확인 → 본인이
   작성한 요구사항은 "수정" 버튼이 보이고 수정 가능, 남이 작성한 건 "수정" 버튼 자체가
   안 보이는지 확인 → `/requirements/board`, `/requirements/settings` 직접 URL 접근 시
   리다이렉트되는지 확인.
3. 완료 처리된 요구사항에서는 실무자/작성자 누구에게도 "수정" 버튼이 안 보이는지 확인.

- [ ] **Step 6: 브라우저 시나리오 — 전체관리자 토글**

1. 1차 계정으로 `/admin/brands` → 팀원 중 한 명에게 "전체관리자 지정" 클릭 → 배지가
   붙는지 확인 → 그 계정으로 전환해서 실제로 `/admin/brands`, `/admin/dashboard`
   접근되는지 확인.
2. 원래 계정으로 돌아와 방금 지정한 사람의 "전체관리자 해제" 클릭 → 정상 해제되는지
   확인(이 시점엔 전체관리자가 2명 이상이므로 막히지 않아야 함).
3. 전체관리자가 1명만 남을 때까지 다른 계정들의 전체관리자 권한을 없앤 뒤, 마지막
   1명을 해제 시도 → 400 에러로 막히고 `actionError` 배너가 뜨는지 확인.

- [ ] **Step 7: 최종 커밋(필요 시)**

브라우저 검증 중 발견된 사소한 수정이 있었다면 그 변경분만 별도로 커밋한다. 문제
없었다면 이 태스크는 커밋 없이 종료.

---

## 스펙 커버리지 자체 점검

- tier 4단계 확장 + 기존 3차→4차 마이그레이션 → Task 1 ✅
- `TIER_RANK`/`TIER_LABELS` 갱신, `canProcess`/`canManageBrand` 분리 → Task 2 ✅
- 기존 API들의 minTier 조정(요구사항 조회/등록/상태/담당자/중복/유사후보), 비공개 문턱
  3차로 조정 → Task 4, Task 5(GET 부분) ✅
- 요구사항 내용 수정 API(본인 작성 또는 3차 이상, 완료/중복 잠금, 이력 기록) →
  Task 5 ✅
- 전체관리자 지정/해제 + 마지막 전체관리자 보호 → Task 3, Task 6 ✅
- TopBar/보드/설정 게이팅 분리 → Task 7 ✅
- 요구사항 상세 화면 게이팅 교체 + 수정 버튼/폼 → Task 8, Task 9 ✅
- 브랜드 설정 화면 tier 선택지 갱신 → Task 10 ✅
- `/admin/brands` 전체관리자 토글 UI → Task 11 ✅
- 순수 로직 Vitest(canProcess/canManageBrand/checkLastGlobalAdmin) → Task 2, Task 3 ✅
- 범위 제외(로그인/인증, 상태 세분화, 필드별 diff 이력) → 계획에도 포함 안 함 ✅
