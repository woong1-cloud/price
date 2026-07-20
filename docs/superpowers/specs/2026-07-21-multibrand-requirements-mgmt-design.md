# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 설계 문서

- 작성일: 2026-07-21
- 상태: 1단계 구현 승인됨
- 위치: `agent/pj/` (신규 Next.js 프로젝트, `agent` git 저장소 하위)

## 배경 / 목적

SPAO를 포함해 이랜드리테일 산하 여러 브랜드가 공동으로 사용하는 요구사항(기능 개선) 관리
웹앱. 현재는 로그인 없이 운영하되, 향후 Supabase Auth + RLS로 전환할 때 테이블 재설계
없이 정책만 추가하면 되도록 처음부터 `brand_id`를 모든 테이블에 두고 설계한다.

## 사용자 구조 (3단계)

| Tier | 명칭 | 권한 |
|---|---|---|
| 1차 | 시스템 관리자 | 브랜드 생성/수정/비활성화(전용), 전체 브랜드 통합 대시보드, 전사 표준 워크플로 템플릿 관리. **모든 브랜드에 대해 전역적으로 권한을 가짐** |
| 2차 | 브랜드 관리자 | 배정된 브랜드 안에서만 팀원/카테고리/워크플로 설정. 새 브랜드 생성·타 브랜드 수정 불가 |
| 3차 | 실무자(기획/개발/뷰어) | 자기 브랜드 내에서 요구사항 등록·처리·코멘트 |

1차 사용자는 브랜드 하나에 종속되지 않으므로 `user_brand_roles`에 행을 두지 않고
`team_members.is_global_admin` 플래그로 표현한다 (사용자 승인 사항).

## 아키텍처

- **애플리케이션**: Next.js 14 (App Router) + JavaScript, Tailwind, shadcn/ui.
- **DB/스토리지**: Supabase (Postgres + Storage). 이번 단계는 RLS 비활성화.
- **DB 접근 경로**: 브라우저는 Supabase에 **직접 접속하지 않는다.** 모든 읽기/쓰기는
  Next.js Route Handler(`app/api/*`)를 경유하고, 서버에서만
  `SUPABASE_SERVICE_ROLE_KEY`(비-`NEXT_PUBLIC_` 환경변수)를 사용한다.
  - 이유: RLS가 꺼져 있는 상태에서 브랜드 스코프 체크·tier 체크·`is_confidential` 필터링을
    담당할 단일 지점이 필요하다. 이 지점을 API 레이어로 못박아 두면, 추후 실제 로그인을
    붙일 때 이 레이어만 세션 기반으로 바꾸면 되고 RLS는 방어선으로 추가만 하면 된다.
  - 모든 route handler는 공통 헬퍼 `requireBrandAccess(memberId, brandId, minTier)`를
    거쳐야 한다. 라우트마다 체크 로직을 흩어놓지 않고 이 헬퍼 하나로 강제한다.
- **알려진 한계 (승인됨)**: 실제 로그인이 없으므로 요청에 실린 `memberId`를 신뢰한다.
  UI가 버튼을 숨기고 서버가 tier를 검증해도, 브라우저 devtools/curl로 임의의 `memberId`를
  실어 보내는 우회는 막지 못한다. 이는 "로그인 없이 운영"이라는 요구사항에 내재된 한계이며,
  사내망 한정 운영 + 조속한 Supabase Auth 전환으로 완화한다.
- **신원(identity) 대체 흐름**: 로그인 대신 진입화면에서 이름 선택 → 그 사람이 접근 가능한
  브랜드 조회 → 브랜드 선택 → `{memberId, name, brandId, isGlobalAdmin}`을 `localStorage`에
  저장해 세션 동안 유지한다. 이 localStorage 값은 UX 편의일 뿐 보안 경계가 아니며, 실제
  권한 경계는 항상 서버(API 라우트)에서 재검증한다.

## 데이터 모델

### team_members
`id, name, is_active, is_global_admin(bool, default false)`

### brands
`id, name, code, workflow_template('표준'|'커스텀'), is_active, created_by(team_members FK, 1차만 기록)`

### user_brand_roles (2차/3차 전용, 1차는 행 없음)
`id, team_member_id(FK), brand_id(FK), tier('2차'|'3차'), sub_role('기획'|'개발'|'뷰어'|null, 3차에만 사용)`

### brand_categories
`id, brand_id(FK), category_name, sort_order`

### requirements
`id, brand_id(FK, 필수), priority, urgency, request_date, requester(team_members FK),
status('대기'|'요청'|'검토'|'정책정의'|'진행중'|'완료', default '대기'), category(brand_categories FK),
title, as_is, to_be, note, assignee(team_members FK, nullable), completed_at(자동기록, nullable),
duplicate_count(default 0), sprint_tag(nullable), is_confidential(bool, default false),
screenshot_url(nullable), annotated_image_url(nullable), annotation_data(jsonb, nullable),
created_at, updated_at`

### change_logs (2단계에서 사용, 테이블은 1단계에 생성)
`id, requirement_id(FK), brand_id(FK), changed_by(team_members FK), change_type, field_name,
old_value, new_value, comment, created_at`

### duplicate_links (2단계에서 사용, 테이블은 1단계에 생성)
`id, requirement_id(FK), brand_id(FK), linked_requester(team_members FK), linked_note, created_at`

### in_app_notifications (4단계에서 사용, 테이블은 1단계에 생성)
`id, team_member_id(FK), requirement_id(FK), message, is_read(default false), created_at`

모든 FK는 `brand_id`를 직접 또는 간접으로 갖고 있어, 추후 RLS 정책 추가 시
`brand_id = current_setting('app.current_brand')` 형태로 바로 적용 가능하다.

## 권한 잠금 규칙

- `brands` 생성/수정/비활성화: `is_global_admin = true`인 사용자만. UI 버튼 자체를 숨기고,
  API 라우트에서도 `requireBrandAccess`로 재검증.
- 2차/3차는 브랜드 선택 드롭다운에 자신이 속한 브랜드만 노출 (`user_brand_roles` 기준,
  1차는 전체 활성 브랜드).
- `is_confidential = true` 요구사항은 2차 이상만 목록/상세에서 조회 가능. 목록 API가
  호출자의 tier를 서버에서 확인해 필터링.

## 1단계 구현 범위

1. **DB 마이그레이션**: 위 8개 테이블 생성 (SQL 파일, Supabase에 수동 적용).
2. **시드 스크립트**: 샘플 브랜드 2~3개(스파오, 뉴발란스, 스파오키즈), 1차 관리자 1명,
   브랜드별 2차 관리자 1명 + 3차 실무자 2~3명, 브랜드별 기본 카테고리. 브랜드 관리 UI는
   3단계에 만들어지므로, 1단계 테스트는 이 시드 데이터로 진행한다.
3. **진입 화면** (`/`): 이름 드롭다운(활성 팀원) → 브랜드 드롭다운(권한에 따라 필터링) →
   확인 시 identity를 localStorage에 저장하고 `/requirements`로 이동.
4. **요구사항 리스트** (`/requirements`): 현재 브랜드로 스코프. 데스크톱은 테이블,
   모바일(`< md`)은 카드형 리스트. `is_confidential` 행은 2차 이상만 노출. 기본 정렬은
   `request_date` 최신순.
5. **등록 폼**: priority, urgency, request_date, requester, category, title, as_is, to_be,
   note, is_confidential 입력. status는 서버에서 '대기'로 강제 설정. assignee/스크린샷/
   마킹/스프린트태그/중복 처리 UI는 이후 단계에서 추가(컬럼은 이미 존재).
6. **범위 제외 (2단계 이후)**: 상태 변경, Triage 인박스, change_logs 기록, 중복 병합,
   브랜드/설정 관리 화면, 통합 대시보드, 인앱 알림, 이미지 업로드, 엑셀 내보내기, PWA.

## API 설계 (1단계)

- `GET /api/team-members` — 활성 팀원 목록 (이름, id, is_global_admin)
- `GET /api/my-brands?memberId=` — 해당 팀원이 접근 가능한 활성 브랜드 목록
- `GET /api/requirements?brandId=&memberId=` — 브랜드 스코프 목록, confidential 필터링 적용
- `POST /api/requirements` — 생성. body에 `memberId, brandId, ...`; 서버가
  `requireBrandAccess(memberId, brandId, '3차')`로 검증 후 status='대기'로 insert.
- `GET /api/brand-categories?brandId=` — 등록 폼 카테고리 드롭다운용

모든 응답 에러는 `{ error: string }` + 적절한 HTTP status(400/403/404/500).

## 에러 처리 / 검증

- API 라우트: 필수 필드 누락 400, 브랜드/tier 불일치 403, 존재하지 않는 리소스 404.
- 클라이언트: fetch 래퍼가 에러를 인라인 메시지(폼 상단 또는 토스트)로 표시.

## 테스트 전략

- `requireBrandAccess` 등 순수 권한 판정 로직에 대한 Vitest 단위 테스트.
- UI 플로우(진입 → 리스트 → 등록)는 dev 서버를 띄워 브라우저로 직접 검증 (자동 e2e는
  이 단계에서 과잉투자로 판단해 도입하지 않음).

## 향후 단계 로드맵 (참고용, 상세 스펙은 각 단계 착수 시 별도 작성)

2단계 Triage 인박스·change_logs·중복 병합 / 3단계 브랜드 관리·브랜드 설정 화면·통합
대시보드 / 4단계 인앱 알림·저장된 필터 뷰 / 5단계 모바일 카메라 업로드·캔버스 마킹 /
6단계 PWA·엑셀 내보내기(맑은 고딕).
