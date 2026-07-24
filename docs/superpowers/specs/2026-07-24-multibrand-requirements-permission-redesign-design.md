# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 권한 구조 재설계 설계 문서

- 작성일: 2026-07-24
- 상태: 설계 승인 완료
- 선행: 1단계~3단계(브랜드 관리·브랜드 설정) + 통합 대시보드 완료 (`feature/multibrand-requirements-app`)
- 위치: `agent/pj/`
- 관련(별도 진행 예정, 이번 범위 아님): 로그인/인증(아이디·비밀번호, 세션 유지) — 이 스펙 완료 후 별도 브레인스토밍

## 배경 / 목적

실사용 조직(브랜드 마케터·온라인 MD, 서비스 기획자, 개발자)을 앱에 대입해보니, 지금의
"등록만 가능한 3차 / 뭐든 다 되는 2차" 2단계 모델로는 실제 업무 흐름을 표현할 수 없었다.
구체적으로 세 가지 문제가 확인됐다:

1. **직무(sub_role: 기획/개발/뷰어)가 라벨일 뿐 실제 권한과 무관** — 3차는 sub_role과
   무관하게 항상 등록만 가능.
2. **요구사항 내용을 등록 후 수정하는 기능 자체가 없음** — 상태·담당자만 바꿀 수 있고,
   제목/As-Is/To-Be 같은 본문은 처음 등록한 그대로 고정.
3. **"요구사항 처리 권한"과 "브랜드 운영 관리 권한"(팀원 배치·카테고리 관리)이 2차
   하나에 뭉쳐 있음** — 매일 요구사항을 처리하는 실무자에게 팀원 관리 권한까지 자동으로
   따라옴.

이번 스펙은 이 세 가지를 해소하는 4단계 권한 체계로 재설계한다.

## 범위

- 브랜드 내부 권한을 2단계(2차/3차) → **4단계(1차/2차/3차/4차)** 로 확장.
- 요구사항 **내용 수정** 기능 신규 추가.
- **전체관리자(1차) 지정/해제** 화면 신규 추가(지금까지 SQL로만 가능했음).
- **범위 제외**: 로그인/인증(아이디·비밀번호, 세션), 상태 전환을 실무자 중에서도
  기획/개발로 더 세분화하는 것(이번엔 "실무자는 다 같은 처리권한"으로 통일하기로 확정),
  필드별 세밀한 수정 이력(diff) 추적.

## 데이터 모델 변경

### 마이그레이션: `user_brand_roles.tier` 4단계로 확장

```sql
-- Supabase SQL Editor에 붙여넣어 실행한다.
-- (0001_init.sql ~ 0003_phase3.sql 실행 이후)

alter table user_brand_roles drop constraint if exists user_brand_roles_tier_check;
alter table user_brand_roles add constraint user_brand_roles_tier_check
  check (tier in ('2차','3차','4차'));

-- 기존 3차(구 "요청자" 의미)를 4차로 옮겨서 '3차'를 새 의미(실무자)로 비워둔다.
update user_brand_roles set tier = '4차' where tier = '3차';
```

**⚠️ 운영 주의사항**: 이 마이그레이션을 적용하는 순간, 지금 요구사항을 처리하던 기존
3차 팀원은 전부 4차(요청자)로 내려간다. 계속 처리 권한이 필요한 사람은 마이그레이션
직후 브랜드 설정 화면에서 **수동으로 3차로 재지정**해야 한다. 적용 전에 "누구를 3차로
올릴지" 목록을 미리 준비해 둘 것.

### 등급 정의

| 등급 | 명칭 | 브랜드 설정(팀원/카테고리) | 요구사항 처리(상태·내용·담당자) | 요구사항 등록/조회 |
|---|---|---|---|---|
| 1차 | 전체 관리자 | ✅(모든 브랜드) | ✅(모든 브랜드) | ✅ |
| 2차 | 브랜드 관리자 | ✅(자기 브랜드) | ✅ | ✅ |
| 3차 | 실무자(신규) | ❌ | ✅ | ✅ |
| 4차 | 요청자 | ❌ | ❌(단, 본인이 작성한 건은 내용 수정 가능) | ✅ |

1차는 브랜드에 종속되지 않는 전역 플래그(`team_members.is_global_admin`)이므로 이번
`tier` 확장과 별개다.

## 권한

### 클라이언트 게이팅 함수 재편 (`lib/tiers.js`)

기존 `canManage(identity)`는 "처리"와 "브랜드 관리"를 구분하지 못했다. 둘로 나눈다.

```js
export const TIER_RANK = { '4차': 1, '3차': 2, '2차': 3, '1차': 4 };
export const TIER_LABELS = {
  '1차': '전체 관리자',
  '2차': '브랜드 관리자',
  '3차': '실무자',
  '4차': '요청자',
};

// 요구사항 처리(상태변경/내용수정/담당자지정) 가능 여부. 1차/2차/3차.
export function canProcess(identity) {
  return identity?.isGlobalAdmin === true || ['1차', '2차', '3차'].includes(identity?.tier);
}

// 브랜드 운영 관리(팀원 배치/카테고리 관리) 가능 여부. 1차/2차. 기존 canManage를 대체한다.
export function canManageBrand(identity) {
  return identity?.isGlobalAdmin === true || identity?.tier === '1차' || identity?.tier === '2차';
}
```

`canManage`를 쓰던 기존 호출부는 의미에 따라 `canProcess` 또는 `canManageBrand`로
나눠 교체한다(아래 UI 섹션 참고). `isGlobalAdmin`, `checkLastBrandAdmin` 등 이미 있는
함수는 그대로 둔다.

### 서버 재검증 — 기존 API의 최소 등급 조정

로직 변경 없이 `requireBrandAccess(..., minTier)` 호출부의 문자열만 바꾼다
(`checkBrandAccess`의 랭크 비교 로직은 `TIER_RANK`만 갱신하면 그대로 동작).

| API | 기존 minTier | 변경 후 |
|---|---|---|
| `GET /api/requirements`, `POST /api/requirements` | `'3차'` | `'4차'` |
| `PATCH .../status`, `PATCH .../assignee`, `POST .../merge`, `GET .../similar` | `'2차'` | `'3차'` |
| 비공개 요구사항 조회 가능 여부(`canSeeConfidential`), 등록 시 비공개 설정 가능 여부(`canSetConfidential`) | `TIER_RANK['2차']` 이상 | `TIER_RANK['3차']` 이상 |
| `POST/PATCH/DELETE /api/brand-team(...)`, `POST/PATCH/DELETE /api/brand-categories(...)` | `'2차'` | **변경 없음(`'2차'` 그대로)** |

### 신규: 요구사항 내용 수정

**`PATCH /api/requirements/[id]`**

- body: `{ memberId, brandId, title?, priority?, urgency?, category?, asIs?, toBe?, note?, isConfidential? }` (제공된 필드만 수정)
- 권한: `requireBrandAccess(memberId, brandId, '4차')`로 먼저 브랜드 소속만 확인한 뒤,
  다음 조건 중 하나를 만족해야 함:
  - 호출자 tier가 `'3차'` 이상(`TIER_RANK[callerTier] >= TIER_RANK['3차']`), 또는
  - 해당 요구사항의 `requester === memberId`(본인이 작성)
  - 아니면 `ApiError(403, '수정 권한이 없습니다.')`
- `current.status`가 `'완료'` 또는 `'중복'`이면 `ApiError(400, '완료되었거나 병합된 요구사항은 수정할 수 없습니다.')`
- `isConfidential` 필드는 `canSetConfidential` 문턱(3차 이상)을 만족하는 호출자만 바꿀 수
  있음. 4차가 본인 글을 수정하면서 이 필드를 같이 보냈다면 **요청 전체를 막지 않고 그
  필드만 조용히 무시**한다(나머지 필드는 정상 반영) — 부분 수정 API의 일반 원칙과 동일.
- 성공 시 `change_logs`에 한 행 기록: `change_type: '내용수정'`, `field_name: null`,
  `comment: '<변경된 필드명 나열>'`(예: `"제목, To-Be 수정"`).

## 전체관리자(1차) 지정/해제

### `PATCH /api/team-members/[id]` 확장

기존 `name`/`isActive`에 더해 `isGlobalAdmin` 필드를 받는다. `requireGlobalAdmin`으로
호출자가 이미 1차여야만 다른 사람을 1차로 올리거나 내릴 수 있다.

**마지막 전체관리자 보호**: `isGlobalAdmin: false`로 내리는 요청이 들어오면, 처리 전에
"활성 전체관리자가 이 사람 포함 1명뿐인가"를 확인한다. 맞으면
`ApiError(400, '이 시스템의 마지막 전체 관리자는 해제할 수 없습니다.')`. Phase 3의
`checkLastBrandAdmin`과 동일한 원리를 전역 스코프로 적용한 새 순수 함수
`checkLastGlobalAdmin({ teamMembers, targetMemberId })`로 구현한다(브랜드 단위가 아니라
전체 `team_members` 중 `is_global_admin=true && is_active=true`인 인원 수를 센다).
전체관리자는 여러 명 지정 가능 — 마지막 1명만 보호 대상이다.

### UI

`/admin/brands` 팀원 섹션의 재직여부 토글 옆에 "전체관리자 지정"/"전체관리자 해제"
버튼을 추가한다.

## UI 변경 요약

- **TopBar**: "보드" 링크는 `canProcess` 기준(1차/2차/3차), "설정" 링크는
  `canManageBrand` 기준(1차/2차, 기존과 동일)으로 재게이팅.
- **`/requirements/board`**: 접근 게이트를 `canProcess` 기준으로 변경.
- **`/requirements/settings`**: 접근 게이트는 `canManageBrand` 기준으로 유지(사실상
  이름만 바뀌고 동작은 그대로).
- **요구사항 상세 화면(`RequirementDetail`)**: 상태·담당자 변경 컨트롤 노출 조건을
  `canProcess`로 변경. 새 **"수정" 버튼** 추가 — `canProcess(identity)`가 참이거나
  `r.requester?.id === identity.memberId`이고 상태가 완료/중복이 아닐 때만 노출. 누르면
  등록 폼과 같은 필드들이 편집 가능한 입력창으로 바뀌고, 저장 시 `PATCH
  /api/requirements/[id]` 호출 후 이력에 반영.
- **브랜드 설정 화면(`BrandTeamSection`/`BrandTeamAssignDialog`)**: tier 선택지를
  `['3차', '4차']`로 갱신(라벨은 `TIER_LABELS` 사용 — "실무자"/"요청자"로 표시). 2차/1차는
  이 화면에서 임명 불가(기존과 동일 — 2차는 `/admin/brands`의 브랜드 생성 시에만 최초
  지정, 1차는 위 새 토글로만 지정).

## 에러 처리

- 4차(요청자)가 상태변경/담당자지정/중복처리/설정관리 API 호출 → 403(기존 `requireBrandAccess` 그대로).
- 4차가 남의 요구사항을 수정하려 함 → 403.
- 완료/중복 처리된 요구사항 수정 시도 → 400.
- 마지막 전체관리자 해제 시도 → 400.
- 클라이언트: 보드/설정 화면 직접 URL 접근 시 각 게이팅 기준에 맞게 리다이렉트(기존
  패턴 유지).

## 테스트 전략

- **순수 로직 Vitest**:
  - `checkLastGlobalAdmin({ teamMembers, targetMemberId })` — 유일한 활성 전체관리자인
    경우/다른 전체관리자가 더 있는 경우/대상이 애초에 전체관리자가 아닌 경우.
  - `canProcess`/`canManageBrand` — tier별(1차~4차), `isGlobalAdmin` true/false,
    identity 없음 케이스.
  - (기존 `checkBrandAccess`는 로직 변경 없음 — `TIER_RANK` 값만 바뀌므로 기존 테스트
    스위트가 여전히 유효한지 재확인만 한다.)
- **API/UI**: 기존 관례대로 `npm run lint` 통과 확인 후 브라우저로 다음을 확인.
  1. 마이그레이션 적용 후 기존 3차 팀원이 4차로 내려갔는지, 브랜드 설정에서 특정 팀원을
     3차로 재지정할 수 있는지 확인.
  2. 4차 계정으로 요구사항 등록 → 본인 건 내용 수정 가능, 남의 건 수정 시도 시 403 확인.
  3. 3차 계정으로 아무 요구사항이나 내용 수정·상태변경·담당자지정 가능, 브랜드 설정
     접근 시 리다이렉트되는지 확인.
  4. 완료 처리된 요구사항 수정 시도 시 400 확인.
  5. `/admin/brands`에서 1차 지정 → 새로 지정된 계정으로 전환해 1차 권한이 실제로
     동작하는지 확인 → 마지막 1차를 해제 시도해 차단되는지 확인(전체관리자가 2명 이상일
     때는 해제가 정상 동작하는지도 확인).

## 구현 순서 개요 (상세는 구현 계획에서)

1. 마이그레이션(tier 4단계 확장 + 기존 3차→4차 이전).
2. `lib/tiers.js` 갱신(`TIER_RANK`/`TIER_LABELS`/`canProcess`/`canManageBrand`) +
   `checkLastGlobalAdmin` 순수 함수 + 단위 테스트.
3. 기존 API 라우트들의 minTier 문자열 일괄 조정.
4. `PATCH /api/requirements/[id]`(내용 수정) 신규.
5. `PATCH /api/team-members/[id]` 확장(`isGlobalAdmin`, 마지막 전체관리자 보호).
6. UI: TopBar/보드/설정 게이팅 교체, `RequirementDetail` 수정 모드 추가,
   `/admin/brands` 전체관리자 토글 추가, 브랜드 설정 tier 선택지 갱신.
7. 브라우저 통합 검증.
