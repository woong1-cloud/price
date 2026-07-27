# 로그인/인증 설계

## 배경

지금 진입 화면(`app/page.js`)은 이름을 드롭다운에서 "선택"하기만 하면 그 사람으로 들어가지는 구조다. 비밀번호 확인이 전혀 없어서, 이름만 알면 누구든 다른 사람 행세를 할 수 있다. 최근 완성한 4단계 권한 체계(전체관리자/브랜드관리자/실무자/요청자, [[project-permission-redesign-2026-07-24]])도 "이 사람이 진짜 그 사람인가"를 보장하지 못하면 의미가 약해진다.

또한 지금 모든 API는 요청 body나 쿼리에 담긴 `memberId`를 그대로 신뢰해서 권한을 판정한다(`requireBrandAccess(memberId, brandId, minTier)`). 로그인 화면만 진짜로 바꾸고 API 쪽을 손대지 않으면, 브라우저 개발자도구로 요청을 조작해 여전히 아무 `memberId`나 보내 다른 사람 행세를 할 수 있다. 그래서 이번 작업은 로그인 화면 교체뿐 아니라 **API 라우트가 body의 `memberId` 대신 실제 로그인 세션에서 신원을 가져오도록 바꾸는 작업**까지 포함한다.

## 목표

- 이메일 + 비밀번호로 로그인해야 앱을 쓸 수 있게 한다. 계정은 전체관리자가 직접 만든다(회원가입 없음).
- 로그인 세션을 30일간 유지한다(별도의 "로그인 기억하기" 체크박스 없이 항상 유지).
- 모든 API가 요청에 실린 `memberId`가 아니라, 서버에서 검증한 로그인 세션으로부터 신원을 가져오도록 바꾼다.
- 임시 비밀번호로 로그인한 최초 1회는 비밀번호 변경을 강제한다.

## 범위 밖

- 실제 이메일 발송/인증(초대 메일, 비밀번호 재설정 메일) — 계정 생성과 비밀번호 재설정은 전부 관리자가 화면에서 직접 처리하고, 결과(임시 비밀번호)는 카카오톡/슬랙 등으로 아웃오브밴드 전달한다.
- 셀프 서비스 회원가입.
- 한 브라우저에서 여러 계정을 빠르게 전환하는 기능("다른 사용자로 전환"은 로그아웃으로 대체된다).
- 소셜 로그인, SSO, 2단계 인증.

## 아키텍처

Supabase Auth를 그대로 사용한다. "누가 로그인했는가"는 Supabase Auth(`auth.users`, 세션 쿠키, 비밀번호 해싱, 세션 갱신을 전부 대신 처리)가 담당하고, "이 사람이 어떤 권한을 가졌는가"는 기존처럼 `team_members`/`user_brand_roles`가 담당한다. 두 테이블은 `team_members.auth_user_id`(→ `auth.users.id`)로 연결한다.

브랜드 선택("지금 어느 브랜드를 보고 있나")은 로그인 세션과 별개 개념이라 기존처럼 클라이언트에 가볍게 저장한다. 다만 "내가 누구인지"(memberId, isGlobalAdmin, tier)는 더 이상 클라이언트가 자유롭게 채워 넣는 값이 아니라, 로그인 + 브랜드 선택 이후 서버가 내려주는 값을 캐시해 둔 것일 뿐이다 — 권한 판정의 기준은 항상 서버 세션이다.

세션 갱신은 Next.js `middleware.js`가 매 요청마다 처리하고, 로그인 안 된 상태로 보호된 페이지에 접근하면 `/login`으로 리다이렉트한다.

지금은 서버 전용 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`만 있고 브라우저에서 쓸 수 있는 Supabase 클라이언트가 전혀 없다. 로그인 폼이 클라이언트에서 `signInWithPassword`를 호출하려면 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`(공개해도 되는 anon key)를 새로 추가해야 하고, `@supabase/ssr` 패키지를 새로 설치해야 한다.

## 데이터 모델 변경

`team_members` 테이블에 컬럼 2개 추가(새 마이그레이션):

```sql
alter table team_members add column auth_user_id uuid references auth.users(id);
alter table team_members add column must_change_password boolean not null default true;
```

- `auth_user_id`: nullable. 계정이 아직 생성되지 않은 팀원은 이 값이 비어 있고, 로그인이 불가능하다.
- `must_change_password`: 계정 생성 또는 관리자의 비밀번호 재설정 시 `true`로 세팅된다. 사용자가 직접 비밀번호를 바꾸면 `false`가 된다.

비밀번호 자체는 `password_hash` 같은 컬럼을 우리 쪽에 따로 두지 않는다 — Supabase의 `auth.users`가 관리한다. 이메일도 `auth.users.email`에 있으므로 `team_members`에 중복으로 두지 않는다.

기존 팀원(김관리, 박스파오, 이기획, 최개발, 정뉴발 등)은 마이그레이션 직후 전부 `auth_user_id`가 비어 있는 상태로 시작하고, 관리자가 계정 생성 화면에서 한 명씩 실제 회사 이메일 + 임시 비밀번호를 입력해 연결해야 로그인할 수 있다.

이메일은 실제 회사 이메일 주소를 로그인 아이디로 쓰지만, 실제 메일함과의 연동(발송/인증)은 필요 없다 — Supabase Admin API로 계정을 만들 때 `email_confirm: true`로 만들어서 이메일 인증 절차 없이 바로 로그인 가능한 상태로 생성한다.

## 로그인 · 로그아웃 · 비밀번호 변경 플로우

**로그인 (`/login`):**
1. 이메일 + 비밀번호 입력 → Supabase Auth(`signInWithPassword`)로 인증.
2. 로그인 성공 후 `team_members.must_change_password`가 `true`면 → 다른 화면 접근 없이 `/change-password`로 강제 이동. 이 화면에서 로그아웃 말고는 다른 동작을 할 수 없다.
3. 비밀번호를 다 바꾸면(또는 애초에 `must_change_password`가 `false`였으면) → 소속 브랜드가 1개면 바로 `/requirements`로, 2개 이상이면 브랜드 선택 화면으로 이동. 소속 브랜드가 0개(관리자가 계정만 만들고 아직 어느 브랜드에도 배치하지 않은 경우)면 "아직 배치된 브랜드가 없습니다. 관리자에게 문의하세요" 화면을 보여주고 로그아웃 버튼만 제공한다. 단, 전체관리자는 모든 브랜드에 접근 가능하므로 이 경우에 해당하지 않는다.
4. 브랜드 선택(또는 자동 선택) 직후, 새로 만들 `GET /api/me?brandId=...` 같은 엔드포인트가 서버 세션 기준으로 `{memberId, name, isGlobalAdmin, tier}`를 내려주고, 클라이언트는 이 값을 `localStorage`(기존 `saveIdentity`)에 캐시해서 화면 표시/클라이언트 게이팅에 쓴다.

**로그아웃:**
- TopBar의 "다른 사용자로 전환" 버튼을 "로그아웃"으로 대체한다. 클릭하면 Supabase 세션 종료 + 로컬 identity 캐시 삭제 + `/login`으로 이동.

**비밀번호 변경(자발적):**
- 로그인 후 TopBar 메뉴 등에서 언제든 "비밀번호 변경" 가능(현재 비밀번호 확인 없이, 로그인된 상태 자체가 인증이므로 새 비밀번호만 입력).

**비밀번호 분실 시:**
- 이메일 발송이 없으므로, 사용자가 관리자에게 요청하면 관리자가 `/admin/brands` 팀원 관리 화면에서 "비밀번호 재설정"으로 새 임시 비밀번호를 발급한다(`must_change_password`도 다시 `true`). 본인에게는 아웃오브밴드로 전달.

**최초 부트스트랩:**
계정 생성 화면 자체가 "로그인된 전체관리자"만 쓸 수 있어서, 맨 처음엔 아무도 로그인할 수 없는 닭-달걀 문제가 있다. 이번 마이그레이션은 기존 마이그레이션들처럼 수동 단계가 하나 필요하다:
1. Supabase 대시보드의 Authentication 화면에서 최초 관리자(예: 김관리) 계정을 이메일+비밀번호로 직접 생성한다.
2. SQL로 `team_members.auth_user_id`를 방금 만든 `auth.users` 행의 id로 연결한다.

이후부터는 전부 화면에서 처리 가능하다. 이 절차는 마이그레이션 파일의 주석 및 배포 문서에 남긴다.

## API 라우트 리팩터링 — 세션 기반 신원 확인

**서버 (`lib/permissions.js`):**
- `requireBrandAccess(memberId, brandId, minTier)` → `requireBrandAccess(request, brandId, minTier)`로 시그니처 변경. 내부에서:
  1. 요청의 쿠키로 Supabase 서버 클라이언트(`@supabase/ssr`의 `createServerClient`)를 만들고 `auth.getUser()`로 세션을 서버에 재검증한다(로컬에서 JWT만 디코드하는 `getSession()`이 아니라, Supabase 서버에 다시 확인하는 `getUser()`를 쓴다).
  2. 세션이 없으면 `ApiError(401, '로그인이 필요합니다.')`.
  3. `auth_user_id`로 `team_members`를 조회해 진짜 `memberId`/`is_active`/`is_global_admin`을 얻는다. 비활성 계정이면 403.
  4. 이후 로직(`checkBrandAccess`로 tier 비교 등)은 기존과 동일 — memberId를 "어디서 가져오는지"만 바뀐다.
- `requireGlobalAdmin(memberId)`도 `requireGlobalAdmin(request)`로 동일하게 변경.
- 이 두 함수를 쓰는 API 라우트 15개 이상(요구사항 관련 전체, 브랜드/팀원/카테고리 관리 전체)이 body/query에서 `memberId`를 읽던 부분을 지우고 `request`를 넘기도록 바뀐다. 로직 자체는 바뀌지 않는 기계적인 작업이다.
- `GET /api/team-members`와 `GET /api/my-brands`는 `requireBrandAccess`/`requireGlobalAdmin`을 거치지 않고 자체적으로 쿼리의 `memberId`를 읽어 처리하는 별도 라우트다(`GET /api/team-members`는 현재 그 체크조차 없는 상태 — 기존부터 있던 구멍). 이 두 라우트도 같은 세션 기반 방식으로 바꾼다. 특히 `GET /api/my-brands`는 로그인 직후 "내 브랜드 목록"을 가져오는 데 쓰이므로(브랜드 선택 화면의 기반), 세션에서 얻은 memberId를 쓰도록 바뀌는 게 로그인 플로우의 핵심 축이다.

**클라이언트:**
- 지금 컴포넌트들이 `fetch`할 때 body/쿼리에 `memberId: identity.memberId`를 직접 넣고 있는데, 이제 지운다 — 브라우저가 쿠키를 자동으로 함께 보내므로 서버가 세션에서 알아서 신원을 찾는다. `RequirementFormDialog`, `RequirementDetail`, `RequirementEditForm`, 브랜드/팀원 관리 화면 등 10개 이상 컴포넌트에서 이 부분을 제거하는 기계적인 작업이 필요하다.
- `brandId`는 계속 클라이언트가 보낸다 — "어느 브랜드의 데이터를 볼/조작할 것인가"를 고르는 값일 뿐이고, 실제 접근 가능 여부는 서버가 세션의 진짜 memberId 기준으로 판정하므로 스푸핑 문제가 없다.

**`identity`(로그인한 사람 정보)의 역할 변화:**
지금은 `localStorage`에 저장된 값이 권한 판정의 기준이라 조작이 가능했지만, 이제 진짜 권한 판정은 항상 서버 세션 기준이고 `localStorage`의 `identity`는 화면 표시 및 클라이언트 쪽 UI 게이팅(`canProcess`/`canManageBrand` 등)을 위한 **표시용 캐시**로만 남는다. 서버가 내려준 값을 캐시해 둔 것이므로, 여기 담긴 값을 클라이언트가 조작해도 서버 쪽 실제 데이터 접근에는 영향이 없다(서버는 이 캐시를 전혀 신뢰하지 않는다).

## 관리자 화면 UI

`/admin/brands`의 팀원 테이블에 액션 추가:
- `auth_user_id`가 없는 팀원 → **"계정 생성"** 버튼 → 이메일 + 임시 비밀번호 입력 다이얼로그. 제출 시 서버가 Supabase Admin API(`auth.admin.createUser`, `email_confirm: true`)로 계정을 만들고 `team_members.auth_user_id`/`must_change_password=true`를 갱신한다.
- `auth_user_id`가 있는 팀원 → **"비밀번호 재설정"** 버튼 → 새 임시 비밀번호 입력 다이얼로그. 제출 시 서버가 Supabase Admin API(`auth.admin.updateUserById`)로 비밀번호를 바꾸고 `must_change_password=true`로 되돌린다.

기존 활성화/비활성화, 전체관리자 지정/해제 버튼들과 같은 줄에 배치한다.

## 에러 처리

- 잘못된 이메일/비밀번호: 로그인 폼에 일반적인 오류 메시지("이메일 또는 비밀번호가 올바르지 않습니다") — 어느 쪽이 틀렸는지 구분해서 알려주지 않는다(계정 존재 여부 노출 방지).
- 세션 없이 보호된 API 호출: 401, 미들웨어가 보호된 페이지 접근 시 `/login`으로 리다이렉트.
- 세션은 있지만 `is_active=false`이거나 `team_members` 매핑이 없는 경우: 403.

## 테스트 전략

- 순수 로직(브랜드 선택 필요 여부 판단 등 있다면)은 기존처럼 Vitest로 TDD.
- 로그인/세션/미들웨어는 로직 대부분이 Supabase Auth에 위임되므로, `npm run lint` + 브라우저로 전체 플로우를 검증한다: 로그인 → 강제 비밀번호 변경 → 브랜드 선택 → 로그아웃, 세션 없이 API 직접 호출 시 401 확인, 비활성 계정 로그인 차단 확인.

## 스펙 커버리지 자체 점검

- 계정 생성(관리자 직접 생성, 이메일+임시비밀번호) → 아키텍처/데이터 모델/관리자 화면 섹션 ✅
- 로그인 세션 30일 유지 → 아키텍처(Supabase Auth 세션 갱신에 위임) ✅
- "다른 사용자로 전환" → 로그아웃 대체 → 로그인/로그아웃 플로우 섹션 ✅
- 최초 로그인 시 비밀번호 변경 강제 → 로그인 플로우 + 데이터 모델(`must_change_password`) ✅
- API가 세션 기반 신원을 쓰도록 전면 리팩터링 → API 라우트 리팩터링 섹션 ✅
- `GET /api/team-members`/`GET /api/my-brands` 인증 구멍 → 같은 섹션에 포함 ✅
- 새 환경변수(`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`)·패키지(`@supabase/ssr`) 필요성 → 아키텍처 섹션 ✅
- 소속 브랜드 0개인 경우 → 로그인 플로우 섹션 ✅
- 비밀번호 분실 시 관리자 재설정 → 로그인/로그아웃 플로우 섹션 ✅
- 최초 부트스트랩(닭-달걀 문제) → 별도 섹션 ✅
- 범위 밖(회원가입, 실제 메일 발송, 계정 빠른 전환, SSO 등) → "범위 밖" 섹션에 명시 ✅
