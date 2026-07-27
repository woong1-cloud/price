# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 3단계 설계 문서

- 작성일: 2026-07-23
- 상태: 설계 승인 완료
- 선행: 1단계(진입/목록/등록) + UI 폴리싱 + 2단계(Triage/보드/이력/중복병합/이미지) 완료
  (`feature/multibrand-requirements-app`)
- 위치: `agent/pj/`
- 상위 설계: `docs/superpowers/specs/2026-07-21-multibrand-requirements-mgmt-design.md`
  (향후 단계 로드맵의 "3단계 브랜드 관리·브랜드 설정 화면·통합 대시보드" 중 앞 두 개)

## 배경 / 목적

지금까지 브랜드·팀원·카테고리는 전부 Supabase SQL 시드로만 존재했다 — 실제 운영 중에
새 브랜드를 열거나 신규 직원을 등록하거나 팀 구성을 바꾸려면 사람이 직접 SQL을 실행해야
한다. 3단계는 이 관리 작업을 화면으로 옮긴다.

원래 로드맵의 3단계는 "브랜드 관리·브랜드 설정 화면·통합 대시보드"를 한데 묶어놓았지만,
이 셋은 주 사용자(1차/2차/1차)와 데이터 성격(CRUD 화면 vs 읽기 전용 집계)이 달라 독립적으로
쪼갤 수 있다고 판단해, **이번 스펙은 "브랜드 관리 + 브랜드 설정"까지만** 다룬다. 통합
대시보드는 이 둘로 실제 관리 데이터가 화면을 통해 쌓이기 시작한 뒤, 별도 스펙으로 진행한다.

## 이번 단계 범위 요약

1. **브랜드 관리** (`/admin/brands`, 1차 전용) — 브랜드 생성(+최초 2차 관리자 지정),
   수정(이름/코드/워크플로 템플릿), 비활성화.
2. **팀원 관리** (`/admin/brands` 내, 1차 전용) — 신규 직원 등록, 재직여부 수정.
   (같은 화면 안의 별도 섹션 — 브랜드 없이는 배치할 대상도 없으므로 하나의 관리 화면에
   묶는다.)
3. **브랜드 설정** (`/requirements/settings`, 2차 이상, 현재 선택된 브랜드 한정) —
   기존 직원을 브랜드에 배치/해제, tier(2차/3차)·sub_role(기획/개발/뷰어) 변경(마지막
   2차 관리자는 보호), 카테고리 추가/수정/삭제(사용 중이면 삭제 차단)/순서 변경.

### 범위 제외

- **통합 대시보드** — 다음 스텝의 별도 스펙.
- **커스텀 워크플로 실동작**(상태 값 자체를 브랜드별로 다르게 하는 것) — `workflow_template`
  값은 이번 단계에서 표시·수정만 가능하고 실제로 상태 목록에 영향을 주지 않는다. 지금
  상태 6종(대기·요청·검토·정책정의·진행중·완료, +중복)은 모든 브랜드에 공통으로 계속
  적용된다.
- **브랜드/팀원 하드 삭제** — 항상 `is_active` 플래그로만 비활성화(1단계 확정 원칙과
  동일선상).
- **2차의 신규 직원 등록** — 신규 직원 등록은 1차 전용. 2차는 1차가 이미 등록해 둔
  "전사 직원 풀"에서 골라 자기 브랜드에 배치만 한다(직원 중복 생성 방지).

## 데이터 모델 변경

**스키마 변경 없음.** `brands.is_active`, `team_members.is_active`,
`user_brand_roles.tier`/`sub_role`은 1단계 마이그레이션에 이미 있다.

새로 추가하는 건 브랜드 생성을 원자적으로 처리하는 Postgres 함수 하나뿐이다
(마이그레이션 `0003_phase3.sql`):

```sql
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

`workflow_template`은 기존 CHECK 제약(`'표준'|'커스텀'`)을 그대로 따른다 — 이번 단계는
이 값을 저장·표시만 할 뿐 실제 상태 목록 로직에는 반영하지 않는다(범위 제외 참고).

## 권한

### 새 권한 원시(primitive)

기존 `canManage`(2차 이상)와 `requireBrandAccess`(특정 브랜드 전제)는 "브랜드 무관하게
1차인지"를 표현하지 못한다. 이번 단계에서 처음으로 필요해지므로 새로 만든다.

- **`isGlobalAdmin(identity)`** (`lib/tiers.js`, 신규) — 클라이언트 게이팅 전용.
  `identity?.isGlobalAdmin === true`. `canManage`와 별개 함수로 둔다 — `/admin/brands`에
  실수로 `canManage`를 쓰면 2차도 들어가게 되는 버그가 생기므로, 이름부터 명확히
  구분한다.
- **`requireGlobalAdmin(memberId)`** (`lib/permissions.js`, 신규) — 서버 검증 전용.
  `team_members`에서 `id=memberId`인 행의 `is_global_admin`과 `is_active`를 직접 조회해
  확인. `requireBrandAccess`와 달리 `brandId` 파라미터를 받지 않는다(전역 액션이므로).
  실패 시 `ApiError(403, ...)`.

두 함수 모두 기존 `canManage`/`requireBrandAccess`와 같은 원칙을 따른다 — 클라이언트
쪽은 UI 표시용이고, 실제 권한 경계는 항상 서버(`requireGlobalAdmin`)에서 재검증한다.

### 규칙

- **브랜드 관리(`/admin/brands`), 팀원 등록/수정**: `requireGlobalAdmin`(1차만).
- **브랜드 설정(`/requirements/settings`, 브랜드-팀원 배치/해제/tier변경, 카테고리
  CRUD)**: `requireBrandAccess(memberId, brandId, '2차')`(2차 이상, 자기 브랜드 한정).
- **마지막 2차 관리자 보호**: 브랜드-팀원 해제(`DELETE`)나 tier를 3차로 낮추는
  `PATCH` 요청은, 처리 전에 "이 브랜드에서 tier='2차'인 `user_brand_roles` 행이 이
  대상 1명뿐인가"를 확인한다. 맞으면 `ApiError(400, '이 브랜드의 마지막 2차 관리자는
  해제하거나 강등할 수 없습니다.')`. 전역관리자(1차)는 이 카운트에 포함되지 않는다
  (1차는 `user_brand_roles` 행 자체가 없으므로) — 즉 2차가 0명이 되는 걸 막는 것이지,
  "관리자가 0명"이 되는 걸 막는 게 아니다(1차는 모든 브랜드에 항상 접근 가능하므로
  후자는 애초에 발생하지 않는다).

## API

기존 컨벤션(라우트 하나당 단일 책임, `requireBrandAccess`/`requireGlobalAdmin` +
`ApiError`/`errorResponse`)을 그대로 따른다.

- **`GET /api/brands`** — `requireGlobalAdmin`. `is_active` 무관하게 전체 브랜드 목록
  반환(관리 화면용 — 기존 `GET /api/my-brands`는 "접근 가능한 활성 브랜드"만 반환하는
  별개 목적의 API라 그대로 둔다).
- **`POST /api/brands`** — `requireGlobalAdmin`. body
  `{memberId, name, code, workflowTemplate, adminMemberId}`. `create_brand_with_admin`
  RPC 호출. `code` unique 제약 위반 시 400.
- **`PATCH /api/brands/[id]`** — `requireGlobalAdmin`. body 중 제공된 필드만
  (`name`/`code`/`workflowTemplate`/`isActive`) 수정.
- **`POST /api/team-members`** — `requireGlobalAdmin`. body `{memberId, name}`. 신규
  직원 등록(`is_active=true`, `is_global_admin=false` 고정 — 전역관리자 지정은 이번
  단계 범위 밖, 필요시 SQL로).
- **`PATCH /api/team-members/[id]`** — `requireGlobalAdmin`. body 중 제공된 필드만
  (`name`/`isActive`) 수정.
- **`GET /api/team-members?includeInactive=true`** — 기존 라우트에 선택적 쿼리
  파라미터 추가. 미지정 시 기존과 동일(활성만). 관리 화면(재직여부 토글해서 복구하려면
  비활성 인원도 봐야 함)에서만 `true`로 호출.
- **`POST /api/brand-team`** — `requireBrandAccess('2차')`. body
  `{memberId, brandId, targetMemberId, tier, subRole}`. 배치(`user_brand_roles`
  insert, `unique(team_member_id, brand_id)` 위반 시 "이미 이 브랜드에 배치된
  팀원입니다" 400).
- **`PATCH /api/brand-team/[targetMemberId]`** — `requireBrandAccess('2차')`. body
  `{memberId, brandId, tier, subRole}`. tier를 3차로 낮추는 경우 마지막-2차 보호 검증.
- **`DELETE /api/brand-team/[targetMemberId]?memberId=&brandId=`** —
  `requireBrandAccess('2차')`. 마지막-2차 보호 검증 후 해당 `user_brand_roles` 행 삭제.
- **`POST /api/brand-categories`** — `requireBrandAccess('2차')`. body
  `{memberId, brandId, categoryName}`. `sort_order`는 현재 최댓값+1로 자동 부여(맨
  뒤에 추가).
- **`PATCH /api/brand-categories/[id]`** — `requireBrandAccess('2차')`. body 중
  제공된 필드만(`categoryName`/`sortOrder`) 수정.
- **`DELETE /api/brand-categories/[id]?memberId=&brandId=`** —
  `requireBrandAccess('2차')`. 삭제 전 `requirements.category = id`인 행이 있는지
  확인, 있으면 `ApiError(400, '이 카테고리를 사용 중인 요구사항이 있어 삭제할 수
  없습니다.')`.

모든 응답 에러는 `{ error: string }` + 적절한 HTTP status(400/403/404/500), 기존
`errorResponse`/`ApiError` 그대로 사용.

## UI

### `/admin/brands` (1차 전용)

- **접근 제어**: `isGlobalAdmin(identity)`로 게이팅. 아니면 안내 문구 후
  `/requirements`로 리다이렉트(2단계 보드 페이지와 동일 패턴). 서버 API도
  `requireGlobalAdmin`으로 재검증.
- **레이아웃**: 상단에 "브랜드" / "팀원" 두 섹션(탭 또는 세로 배치 — 구현 계획에서
  확정, YAGNI로 최소 복잡도 우선).
- **브랜드 섹션**: 테이블(이름/코드/워크플로/활성여부 배지). "+ 새 브랜드" →
  다이얼로그(이름/코드/워크플로 선택 + 초기 2차 관리자를 전사 직원 중 검색/선택).
  각 행에 수정 버튼(다이얼로그 재사용) + 활성/비활성 토글.
- **팀원 섹션**: 테이블(이름/재직여부). "+ 새 직원" → 다이얼로그(이름만). 각 행에
  재직여부 토글.

### `/requirements/settings` (2차 이상, 현재 브랜드 한정)

- **접근 제어**: `canManage(identity)`로 게이팅(기존 보드 페이지 패턴 재사용). 3차는
  리다이렉트.
- **팀원 배치 섹션**: 현재 브랜드에 배치된 팀원 테이블(이름/tier/subRole). tier·
  subRole은 인라인 드롭다운으로 바로 수정. 각 행에 "해제" 버튼(마지막 2차 시도 시
  서버 400 → 인라인 에러 메시지로 표시, 화면 전체를 지우지 않음 — 2단계
  `RequirementDetail`에서 확정한 `actionError` 패턴 재사용). "+ 배치" → 다이얼로그
  (전사 직원 검색 → 선택 → tier/subRole 지정 후 배치).
- **카테고리 섹션**: 리스트(이름 + 순서 위/아래 버튼 + 삭제 버튼). "+ 카테고리 추가"
  인풋. 삭제 시도 시 사용 중이면 서버 400 메시지를 인라인으로 표시.

### TopBar

- 2차 이상에게 "설정" 링크(`/requirements/settings`) 추가.
- 전역관리자(1차)에게 추가로 "브랜드 관리" 링크(`/admin/brands`) 추가.

## 에러 처리 / 검증

- 마지막 2차 관리자 해제/강등 시도 → 400, 위 문구.
- 사용 중 카테고리 삭제 시도 → 400, 위 문구.
- 브랜드 코드 중복(unique 제약 위반) → 400 "이미 사용 중인 브랜드 코드입니다."
- 이미 배치된 팀원 재배치 시도 → 400 "이미 이 브랜드에 배치된 팀원입니다."
- 1차 전용 라우트(`/api/brands`, `/api/team-members` POST/PATCH)에 2차/3차가 접근 →
  403.
- 2차 전용 라우트(`/api/brand-team`, `/api/brand-categories` 쓰기)에 3차가 접근 → 403.
- 클라이언트: 목록/설정 화면 쓰기 액션 실패는 2단계에서 확정한 대로 화면 전체를
  지우지 않고 인라인 에러 배너로만 표시(로딩 실패와 액션 실패를 별도 state로 분리).

## 테스트 전략

- **순수 로직 Vitest**(1·2단계 패턴 계승):
  - `isGlobalAdmin(identity)` — true/false/undefined identity 케이스.
  - `checkLastBrandAdmin({ roles, targetMemberId, brandId })` (가칭) — 브랜드의
    `user_brand_roles` 목록과 대상 id를 받아 "이 사람이 마지막 2차인가"를 판정하는
    순수 함수. 대상이 유일한 2차인 경우/다른 2차가 더 있는 경우/대상이 애초에 3차인
    경우(보호 대상 아님) 케이스.
- **UI 플로우**: dev 서버 + 실제 브라우저.
  1. 1차로 `/admin/brands` 진입 → 브랜드 생성(초기 2차 지정) → 목록에 반영 확인 →
     비활성화 → 진입화면 브랜드 드롭다운에서 사라짐 확인(`GET /api/my-brands`가
     `is_active` 필터링하므로).
  2. 1차로 신규 직원 등록 → 2차로 전환 후 `/requirements/settings`에서 그 직원을
     자기 브랜드에 배치 → tier/subRole 변경 → 카테고리 추가/삭제(사용 중 삭제 차단
     확인 포함) → 마지막 2차 본인을 해제 시도 → 차단 확인.
  3. 3차로 `/admin/brands`, `/requirements/settings` 직접 URL 접근 시 각각 올바른
     화면으로 리다이렉트되는지 확인.

## 구현 순서 개요 (상세는 구현 계획에서)

1. 마이그레이션 0003(`create_brand_with_admin` 함수) 적용.
2. `isGlobalAdmin`/`requireGlobalAdmin` + `checkLastBrandAdmin` 순수 로직 + 단위 테스트.
3. API 라우트(brands GET/POST/PATCH, team-members POST/PATCH/GET 확장, brand-team
   POST/PATCH/DELETE, brand-categories POST/PATCH/DELETE).
4. `/admin/brands` 페이지(브랜드 섹션 + 팀원 섹션).
5. `/requirements/settings` 페이지(팀원 배치 섹션 + 카테고리 섹션).
6. TopBar 링크(tier/isGlobalAdmin 게이팅).
7. 브라우저 통합 검증.
