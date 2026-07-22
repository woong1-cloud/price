# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 2단계 설계 문서

- 작성일: 2026-07-22
- 상태: 설계 승인 대기
- 선행: 1단계(진입/목록/등록) + UI 폴리싱 완료 (`feature/multibrand-requirements-app`)
- 위치: `agent/pj/`
- 상위 설계: `docs/superpowers/specs/2026-07-21-multibrand-requirements-mgmt-design.md`

## 배경 / 목적

1단계는 요구사항을 **등록**하고 **목록으로 보는** 것까지였다. 2단계는 두 축을 더한다.
- **처리 흐름**: 2차(브랜드 관리자)가 새로 들어온 '대기' 건을 훑어보며(Triage) 상태를
  바꾸고, 담당자를 지정하고, 중복 요청을 하나로 병합한다. 모든 상태 변경은
  이력(change_logs)으로 남겨 추적 가능하게 한다.
- **등록 경험 강화**: 오류를 발견한 사용자가 mo/pc 어디서든 **스크린샷 이미지를 쉽게
  첨부**해 등록할 수 있게 한다(원래 5단계에 있던 이미지 업로드를 앞당김). 이미지 위에
  마킹하는 캔버스 기능은 5단계로 유지한다.

## 이번 단계 범위 요약

1. **칸반 보드 뷰** (`/requirements/board`, 2차 이상 전용) — 상태별 컬럼, 카드를
   **드래그 앤 드롭**으로 상태 변경. 왼쪽 '대기' 컬럼이 Triage 큐 역할을 겸한다.
   (별도 `/requirements/triage` 페이지는 두지 않는다 — 보드가 더 풍부한 상위 호환이라
   대기 컬럼이 Triage를 대체한다.)
2. **목록/보드 뷰 토글 + 필터 바** — 담당자·카테고리·우선순위 빠른 필터를 목록·보드
   상단에 둔다.
3. **요구사항 상세 페이지** (`/requirements/[id]`) — Jira식 레이아웃: 본문 + 메타
   사이드바 + 활동(Activity) 타임라인 + 병합된 요청자.
4. **상태 변경** — 보드 드래그(또는 상세 사이드바 드롭다운)로 자유 전이, change_logs
   기록, `completed_at` 자동 처리.
5. **담당자 지정** — 2차 이상이 카드 메뉴/상세에서 지정(이력 미기록).
6. **중복 병합** — 2차가 중복 건을 기존 건에 병합. pg_trgm 기반 유사 후보 자동 제시.
7. **identity에 tier 심기** — "2차에게만 노출" UI 분기를 위한 선행 작업.
8. **이미지 첨부** — 등록 폼과 상세 페이지에서 요구사항당 이미지 **여러 장** 업로드/미리보기
   /삭제. 모바일 카메라·갤러리, PC 파일선택·드래그앤드롭·클립보드 붙여넣기 지원.

### 범위 제외 (다음 단계로 미룸)

- **캔버스 마킹**(이미지 위 화살표/동그라미, `annotation_data`) — 5단계. 이번 단계는
  이미지 **첨부**까지만.
- 인앱 알림(요청자에게 "당신 요청이 병합됨" 통지) — 4단계.
- 담당자 변경 이력 기록 — 이번 단계는 상태 변경만 기록.
- 의미 기반(임베딩/pgvector) 중복 탐지 — pg_trgm으로 부족하다고 판단되면 별도 단계.
- "내 요청만" 뷰 / 저장된 필터 뷰 — 4단계.
- 브랜드/카테고리/워크플로 설정 화면, 통합 대시보드 — 3단계.
- 자동 병합(사람 확인 없이 로직만으로 병합) — 명시적 비목표. 오탐이 멀쩡한 요청을
  파괴하므로 절대 도입하지 않는다. 로직은 **후보 제시**까지만 한다.

## 데이터 모델 변경 (마이그레이션 0002)

기존 `change_logs`, `duplicate_links` 테이블은 1단계에 이미 생성되어 있어 그대로 사용한다.
새 변경 사항은 다음과 같다.

1. **`requirements.status` CHECK 제약에 `'중복'` 추가**

   현재(0001): `check (status in ('대기','요청','검토','정책정의','진행중','완료'))`
   변경 후: `... in ('대기','요청','검토','정책정의','진행중','완료','중복')`

   (기존 CHECK 제약을 drop 후 재생성하는 마이그레이션.)

2. **`requirement_images` 테이블 신설** — 요구사항당 이미지 여러 장을 담는다. 기존
   `requirements.screenshot_url`(단일) 컬럼은 다중 첨부를 담기엔 부족하므로 별도 테이블을
   둔다. 기존 `screenshot_url` / `annotated_image_url` / `annotation_data` 컬럼은 손대지
   않고 남겨둔다(캔버스 마킹은 5단계).

   ```sql
   create table requirement_images (
     id uuid primary key default gen_random_uuid(),
     requirement_id uuid not null references requirements(id) on delete cascade,
     brand_id uuid not null references brands(id),
     storage_path text not null,          -- 비공개 버킷 내 경로(공개 URL 아님)
     content_type text,
     byte_size integer,
     sort_order integer not null default 0,
     uploaded_by uuid references team_members(id),
     created_at timestamptz not null default now()
   );
   ```

   `brand_id`를 직접 두어 1단계 RLS 준비 원칙과 일관되게 한다. `on delete cascade`로
   요구사항 삭제 시 이미지 행도 정리(스토리지 객체 정리는 애플리케이션에서 처리).

3. **Supabase Storage 비공개 버킷** — `requirement-images`(비공개). 마이그레이션 SQL이
   아니라 Supabase 대시보드/설정 단계에서 생성하는 수동 스텝으로 문서화한다. 객체 경로
   규약: `{brandId}/{requirementId}/{uuid}.{ext}`. 브라우저에 공개 URL을 노출하지 않고,
   조회 시 서버가 **짧은 TTL의 서명 URL**을 발급한다.

4. **pg_trgm 확장 활성화** — `create extension if not exists pg_trgm;`
   중복 후보 유사도 계산에 사용. 선택적으로 유사도 쿼리 성능을 위해
   `requirements`의 검색 대상 텍스트에 GIN 트라이그램 인덱스를 둘 수 있으나, 브랜드당
   요구사항 수가 작은 초기 단계에서는 인덱스 없이도 충분하다. 인덱스는 데이터가 커지면
   추가한다(이번 마이그레이션에는 확장 활성화만 포함).

### change_logs 사용 규약 (이번 단계)

상태 변경 1건마다 한 행을 기록한다.

| 컬럼 | 값 |
|---|---|
| `requirement_id` | 변경된 요구사항 id |
| `brand_id` | 해당 요구사항의 brand_id |
| `changed_by` | 변경을 수행한 memberId |
| `change_type` | `'상태변경'` (일반) 또는 `'중복병합'` (병합으로 인한 상태 변경) |
| `field_name` | `'status'` |
| `old_value` | 이전 상태 |
| `new_value` | 새 상태 |
| `comment` | 병합인 경우 `"'<대상 제목>' 요청에 병합 (#<대상 id>)"`, 대상 id를 함께 보관 |

담당자 변경, 자유 코멘트는 이번 단계에서 기록하지 않는다.

### duplicate_links 사용 규약 (이번 단계)

병합 시 **대상(target) 요구사항 쪽에** 한 행을 추가한다 — "이 요청을 이런 사람들도
요청했다"는 목록.

| 컬럼 | 값 |
|---|---|
| `requirement_id` | 대상(target) 요구사항 id |
| `brand_id` | 대상의 brand_id |
| `linked_requester` | 중복(병합되는) 요구사항의 requester |
| `linked_note` | 중복 요구사항의 제목 + `(#<중복 id>)` |

상세 페이지에서:
- **대상 건**: `duplicate_links where requirement_id = 이 건` → "이 요청에 병합된 요청자들".
- **중복 건**(status='중복'): 자신의 최근 `change_type='중복병합'` change_log의 `new_value`
  /`comment`에서 대상 id를 읽어 "→ '<대상 제목>'에 병합됨" 링크를 표시.

## identity에 tier 심기 (선행 작업)

현재 localStorage identity는 `{memberId, name, isGlobalAdmin, brandId}`로 tier가 없어
"2차에게만 보드 메뉴 노출" 같은 UI 분기가 불가능하다. 다음을 확장한다.

- **`GET /api/my-brands`** 응답의 각 브랜드에 `tier` 추가:
  - 전역관리자(is_global_admin): 모든 브랜드에 대해 `tier: '1차'`.
  - 그 외: `user_brand_roles.tier` 값(`'2차'` | `'3차'`).
- **진입화면(`app/page.js`)**: 브랜드 선택 시 그 브랜드의 `tier`를 identity에 함께 저장.
- **identity 형태**: `{memberId, name, isGlobalAdmin, brandId, tier}`.

**보안 경계 아님**: tier는 UI 조건분기 전용이다. 모든 쓰기 API는 기존대로 매 요청
`requireBrandAccess`로 서버에서 tier를 재검증하므로, 브라우저에서 tier를 위조해도 서버가
막는다. 이는 1단계에서 이미 명시한 "요청에 실린 memberId를 신뢰하되 권한은 서버에서
재검증" 원칙과 동일하다.

## 권한 규칙 (이번 단계)

- **"2차 이상"** = 2차 + 1차(전역관리자). 판정은 기존 패턴
  `isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['2차']`.
- **상태 변경 / 담당자 지정 / 중복 병합 / 유사 후보 조회 / 보드 뷰 접근**: 2차 이상만.
- **상세 조회**: 3차 포함 조회 가능. 단 비공개(`is_confidential`) 건은 3차 접근 시 서버가
  403 (목록에서 이미 숨기지만, URL 직접 접근도 서버에서 차단).
- **상세 페이지 쓰기 컨트롤**(상태/담당자 드롭다운, 병합 버튼): 3차에게는 렌더링하지 않고,
  서버 API도 3차 요청을 403으로 거부.
- **이미지 첨부/삭제**: 해당 브랜드 소속이면 3차 이상 가능(`requireBrandAccess('3차')`).
  등록 당사자(요청자)가 스크린샷을 올리는 게 주 사용처이므로 3차에게도 허용한다. (브랜드
  전체 스코프이고 "내 요청" 소유 판정을 별도로 두지 않는 기존 느슨한 모델을 따른다 —
  이는 1단계에서 명시한 알려진 한계와 동일선상.)
- **비공개 건의 이미지**: 서명 URL은 서버가 상세 응답에서만 발급하고, 상세 GET이 비공개+3차를
  이미 403으로 막으므로 3차는 비공개 이미지의 서명 URL을 받지 못한다.

## API 설계 (2단계)

기존 컨벤션(라우트 하나당 단일 책임)을 따른다.

- **`GET /api/requirements?brandId=&memberId=&status=&assignee=&category=&priority=`** —
  기존 목록 API에 선택적 필터 파라미터 추가(`status`, `assignee`, `category`, `priority`).
  모두 선택적이며, 미지정 시 필터를 걸지 않는다(confidential 필터는 항상 적용).
  - 목록 뷰·필터 바가 이 API를 쓴다.
  - **보드 뷰도 이 API를 재사용**한다: 필터만 서버에서 걸고, 응답을 클라이언트에서
    status별로 그룹핑해 컬럼을 만든다(별도 보드 전용 엔드포인트 불필요). 보드는
    `status='중복'`을 컬럼에 두지 않으므로 클라이언트에서 제외한다.
  - 기본 목록 뷰에서는 `status='중복'` 건을 숨기지 않는다(아래 "병합 동작" 참고).
  - 각 행에 `image_count`(첨부 이미지 수)를 포함해 목록/보드 카드에서 클립 아이콘+개수를
    보여준다(목록에서는 서명 URL을 만들지 않고 개수만 — 성능).

- **`GET /api/requirements/[id]?memberId=`** — 상세. 한 번의 응답으로:
  - `requirement`: 본문 전체(+ requester/category/assignee 조인).
  - `history`: `change_logs where requirement_id = id` (created_at 오름차순).
  - `duplicates`: `duplicate_links where requirement_id = id` (병합되어 들어온 요청자들).
  - `mergedInto`: 이 건이 status='중복'이면 대상 `{id, title}`, 아니면 null.
  - `images`: `requirement_images` 목록(sort_order 순). 각 항목에 **서버가 발급한 짧은 TTL
    서명 URL**을 포함(공개 경로 노출 금지).
  - 검증: `requireBrandAccess('3차')` + 비공개면 3차 차단.

- **`POST /api/requirements/[id]/images`** — 이미지 업로드. `multipart/form-data`로 파일
  1장 이상 + `memberId`, `brandId`.
  - `requireBrandAccess('3차')`.
  - 순수 검증(`validateImageUpload`): 허용 MIME(`image/png|jpeg|gif|webp`), 파일당 최대
    크기(`MAX_IMAGE_BYTES`, 예 10MB), 요구사항당 최대 개수(`MAX_IMAGES_PER_REQ`, 예 10).
  - 서버가 비공개 버킷에 `{brandId}/{id}/{uuid}.{ext}`로 업로드 후 `requirement_images`
    행 추가. 반환: 갱신된 이미지 목록(서명 URL 포함).

- **`DELETE /api/requirements/[id]/images/[imageId]?memberId=&brandId=`** — 이미지 삭제.
  - `requireBrandAccess('3차')`. `requirement_images` 행 + 스토리지 객체 삭제.

- **`PATCH /api/requirements/[id]/status`** — body `{memberId, brandId, status}`.
  - `requireBrandAccess('2차')`.
  - 유효한 status 값 검증(enum). '중복'으로의 직접 전환은 이 라우트로 허용하지 않는다
    (병합 전용 라우트를 거쳐야 함) — 잘못된 상태 유입 방지.
  - `completed_at` 규칙(순수 함수 `computeCompletedAt`): 새 상태가 '완료'이고 이전이
    '완료'가 아니면 `now()`로 설정, 새 상태가 '완료'가 아니고 이전이 '완료'이면 null로
    초기화, 그 외는 유지.
  - `updated_at = now()`, change_logs 기록(change_type='상태변경').

- **`PATCH /api/requirements/[id]/assignee`** — body `{memberId, brandId, assignee}`.
  - `requireBrandAccess('2차')`. assignee는 같은 브랜드 소속 팀원이어야 함(검증). null 허용
    (담당 해제). `updated_at` 갱신. **이력 미기록.**

- **`POST /api/requirements/[id]/merge`** — body `{memberId, brandId, targetId}`.
  - `requireBrandAccess('2차')`.
  - 유효성(순수 함수 `validateMerge`): 자기 자신에 병합 금지, 이미 '중복'인 건은 병합
    금지, 대상이 이미 '중복'인 건이면 금지, 다른 브랜드 건과 병합 금지, 대상 존재 확인.
  - 트랜잭션적 처리(하나라도 실패 시 전체 롤백 지향; Supabase JS로는 순차 실행 후 실패 시
    보상 처리 — 상세는 구현 계획에서):
    1. 중복 건: `status='중복'`, `updated_at`, change_logs(change_type='중복병합',
       old_value=이전상태, new_value='중복', comment에 대상 제목/id).
    2. 대상 건: `duplicate_count += 1`, `updated_at`, duplicate_links 행 추가.

- **`GET /api/requirements/[id]/similar?memberId=&brandId=`** — 중복 후보 제시.
  - `requireBrandAccess('2차')`.
  - 같은 브랜드 안에서, `[id]`를 제외하고, status가 '중복'이 아닌 요구사항 중,
    제목+As-Is+To-Be를 이어붙인 텍스트에 대한 pg_trgm `similarity()`가 임계값
    (`SIMILARITY_THRESHOLD`, 기본 0.2) 이상인 상위 N개(기본 5)를 유사도 내림차순 반환.
  - 반환: `[{id, title, requester_name, status, score}]`.

**등록 시 이미지 흐름**: 등록 폼은 파일을 로컬에서 먼저 모아 미리보기(objectURL)만 보여주고,
제출 시 (1) `POST /api/requirements`(JSON)로 요구사항을 만들어 id를 받은 뒤 (2) 그 id로
`POST .../images`를 호출해 업로드한다. 이미지 업로드가 실패해도 요구사항 본문은 이미
저장돼 있으므로 잃지 않고, 상세 페이지에서 나중에 이미지를 추가할 수 있다(에러만 안내).
`POST /api/requirements`(본문 생성)는 기존 JSON 계약을 그대로 유지한다.

모든 응답 에러는 `{ error: string }` + 적절한 HTTP status(400/403/404/500).

## 병합 동작 & 가시성 ("사라지지 않게")

- 병합된 중복 건은 `status='중복'`이 되지만, 브랜드 전체 목록(`/requirements`)에서
  **숨기지 않는다.** 현재 목록은 "브랜드 전체" 뷰이고 "내 요청만" 뷰가 없어, 숨기면
  요청자가 자기 요청이 사라진 것처럼 느낀다.
- 대신 목록에서 **흐리게(muted) 표시 + "→ '<대상>'에 병합됨" 표기**로 남긴다. 상태 badge
  '중복'은 회색(muted) 스타일.
- 보드 뷰에는 '중복' 컬럼이 없고 '중복' 건을 카드로 두지 않는다(보드는 처리 대상만 다룸).
- 장래에 목록이 지저분해지면 "중복 숨기기" 토글을 추가할 수 있으나 이번 범위 밖.

## UI

Jira의 보드/리스트/이슈상세 패턴에서 이번 단계에 실제로 값어치 있는 것만 채택한다
(번다운·사이클타임 차트, AI 트렌드 분석, 타임라인/캘린더 뷰, 외부 연동 등은 미채택 —
3단계 대시보드 이후 별도 검토).

### 화면 구조 & 내비게이션

- `/requirements` (목록 뷰) — **모든 tier**. 브랜드 요구사항을 훑고 등록. 상단에 필터 바 +
  뷰 토글(목록/보드). 뷰 토글의 "보드"는 tier가 2차 이상일 때만 노출한다.
- `/requirements/board` (보드 뷰) — **2차 이상 전용**. 칸반. 3차가 URL로 직접 진입하면
  안내 후 목록으로 돌려보내고, 데이터 API도 403.
- `/requirements/[id]` (상세) — 모든 tier 조회(비공개+3차는 서버 403). 쓰기 컨트롤은 2차 이상.
- TopBar에 "보드" 링크를 tier 2차 이상일 때만 노출.

### 칸반 보드 뷰 (`/requirements/board`)

- **컬럼**: `대기 · 요청 · 검토 · 정책정의 · 진행중 · 완료` (6개). '중복'은 컬럼에 없음.
  화면이 좁으면 컬럼 영역은 가로 스크롤.
- **대기 컬럼 = Triage 큐**: 새로 들어온 건이 모이는 곳. 컬럼에 "Triage" 힌트 표시.
  컬럼 내 정렬은 **요청일 오름차순**(오래 방치된 건이 위로). 다른 컬럼은 요청일 최신순.
- **카드 내용**: 우선순위 칩(상=danger·중=warning·하=neutral), 제목, 카테고리, 담당자
  아바타(이니셜, 미지정 시 회색 "미"), 비공개 배지(`ti-lock`), 병합 카운트
  (`duplicate_count > 0`이면 `ti-copy N`), 이미지 카운트(`image_count > 0`이면
  `ti-paperclip N`). '완료' 카드는 흐리게(muted).
- **상태 변경 = 카드 드래그 앤 드롭**: 카드를 다른 컬럼으로 놓으면 `PATCH .../status` 호출.
  - 드롭 즉시 낙관적으로 카드를 옮기고, 실패하면 원위치 롤백 + 에러 토스트(불일치 방지를
    위해 서버 응답으로 최종 확정).
  - '완료' 컬럼으로 드롭 시 서버가 `completed_at` 설정(computeCompletedAt).
  - 3차는 드래그 비활성(읽기 전용 보드).
- **드래그 라이브러리**: `@dnd-kit/core`(+`@dnd-kit/sortable`) 사용 — 포인터/터치/키보드
  접근성을 지원해 모바일에서도 동작. (HTML5 native DnD는 터치 미지원이라 배제.)
- **카드 ⋮ 메뉴**(2차 이상): "담당자 지정"(`PATCH .../assignee`), "중복처리"(모달 열기),
  "상세 보기"(상세로 이동). 카드 본문 클릭도 상세로 이동.

### 필터 바 (목록·보드 공통)

- 담당자 / 카테고리 / 우선순위 빠른 필터. 선택 시 `GET /api/requirements`에 해당 파라미터를
  실어 재조회. 목록은 행을 거르고, 보드는 컬럼 안 카드를 거른다.
- 필터 상태는 화면 로컬(URL 쿼리스트링에 반영해 새로고침에도 유지). 저장된 필터 뷰는 4단계.

### 중복처리 모달

- 카드 ⋮ 메뉴(또는 상세)의 "중복처리" → 모달.
- 모달 상단: `GET .../similar`로 받은 **유사 후보 목록**(유사도 순, 각 항목에 제목·요청자·
  상태·유사도). 클릭해 대상 선택.
- 모달 하단: 유사 후보에 없을 때를 대비한 **수동 검색**(같은 브랜드 요구사항 제목 검색).
- 대상 선택 후 "병합" → `POST .../merge`. 성공 시 모달 닫고 보드/목록 새로고침.
- 확인 단계: "이 요청을 '<대상>'에 병합합니다. 되돌릴 수 없습니다." 경고 표시.

### 요구사항 상세 페이지 (`/requirements/[id]`) — Jira식 이슈 상세

- 목록/보드 카드 클릭으로 진입. 데스크톱은 2단(본문 + 사이드바), 모바일은 세로 스택.
- **좌측 본문**: 제목, 상태 badge, As-Is / To-Be / 비고, 비공개 여부.
- **우측 메타 사이드바**: 상태, 담당자, 카테고리, 요청자, 요청일, 우선순위, 긴급도.
  - 2차 이상은 상태·담당자를 여기서 드롭다운으로 변경(보드 드래그와 동일한 API).
  - 3차는 읽기 전용.
- **이미지 갤러리**: `images`를 썸네일 그리드로. 클릭 시 확대(라이트박스). 브랜드 소속이면
  여기서 이미지 추가/삭제(`POST`/`DELETE .../images`). 마킹(캔버스)은 5단계.
- **하단 활동(Activity) 타임라인**: `history`를 시간순으로 아바타 + "OOO님이 상태를
  [이전]→[이후]로 변경 · N일 전". 병합 이벤트도 여기 포함.
- **병합된 요청자**: `duplicates`가 있으면 "이 요청에 병합된 요청: XXX(제목) — 요청자 OOO".
- **병합 안내**: 이 건이 '중복'이면 상단에 "이 요청은 '<대상>'에 병합되었습니다" +
  대상 상세로 가는 링크.

### 등록 폼 이미지 첨부 (`RequirementFormDialog` 확장)

- 기존 텍스트 필드 아래에 **이미지 첨부 영역** 추가.
- **입력 경로**(mo/pc 모두 쉽게):
  - 파일 인풋 `accept="image/*" multiple` — 모바일에서 탭하면 카메라/갤러리 선택 제공.
  - PC **드래그 앤 드롭** 영역.
  - PC **클립보드 붙여넣기**(paste 핸들러) — 스크린샷 캡처 후 바로 Ctrl+V. 오류 제보에 최적.
- 선택한 이미지는 제출 전 **로컬 미리보기 썸네일**(objectURL) + 개별 삭제 버튼.
- 반응형: 등록 폼은 이미 Dialog로 mo/pc 대응. 썸네일 그리드도 폭에 맞춰 접힘.
- 제출 시 앞의 "등록 시 이미지 흐름"대로 본문 생성 → 이미지 업로드.

### 목록 뷰 / badge

- `RequirementList`의 `STATUS_STYLES`에 `중복: 'bg-slate-100 text-slate-400'`(muted) 추가.
- 목록 뷰에서 '중복' 행은 흐리게 + "→ 병합됨" 표기. 카드/행 클릭 시 상세로 이동.
- 이미지가 있는 행/카드에 클립 아이콘 + 개수(`image_count`).

## 에러 처리 / 검증

- 쓰기 라우트: 필수 필드 누락 400, tier 미달 403, 대상/리소스 없음 404, 유효하지 않은
  status 400, 병합 규칙 위반 400.
- 이미지 업로드: 허용 안 되는 MIME 400, 크기 초과 400, 개수 초과 400, 스토리지 실패 500.
- 상세 GET: 비공개+3차 403, 없는 id 404.
- 클라이언트:
  - 보드 드래그는 **낙관적 업데이트**(즉시 카드 이동) 후 서버 응답으로 확정하고, 실패 시
    원위치로 롤백 + 에러 토스트. 상태는 서버 응답을 최종 진실로 삼는다.
  - 상세 사이드바 드롭다운·담당자·병합 모달·이미지 업로드 등 나머지 쓰기는 낙관적 처리
    없이 성공 응답 후 갱신(상태 불일치 방지).

## 테스트 전략

- **순수 로직 Vitest**(1단계 패턴 계승):
  - `computeCompletedAt(oldStatus, newStatus, prevCompletedAt)` — 완료 진입/이탈/유지 케이스.
  - `validateMerge({ sourceId, targetId, sourceStatus, targetStatus, sameBrand })` — 자기병합·
    이미중복·대상중복·타브랜드·정상 케이스.
  - `validateImageUpload({ contentType, byteSize, currentCount })` — 허용 MIME/크기/개수
    경계 케이스.
  - `checkBrandAccess` 기존 테스트에 '2차 이상' 판정 경로가 이미 커버됨(재확인).
- **UI 플로우**: dev 서버 + 실제 브라우저로 진입→등록(이미지 첨부: pc 드래그·붙여넣기,
  mo 카메라/갤러리)→보드(카드 드래그로 상태 변경)→담당자 지정→중복병합→상세(활동 타임라인·
  이미지 갤러리) 확인→필터 바까지 직접 검증. 드래그 앤 드롭은 낙관적 업데이트 성공/실패
  (롤백) 두 경로를 모두 확인. 자동 e2e는 이 단계에서도 미도입.

## 구현 순서 개요 (상세는 구현 계획에서)

1. 마이그레이션 0002('중복' status + `requirement_images` + pg_trgm) 적용 + Storage
   비공개 버킷(`requirement-images`) 생성.
2. identity tier 심기(my-brands 응답 + 진입화면 + identity 형태).
3. 순수 로직 + 단위 테스트(computeCompletedAt, validateMerge, validateImageUpload).
4. API 라우트(list 필터·image_count 확장, detail(+images 서명 URL), status, assignee,
   merge, similar, images POST/DELETE).
5. 상세 페이지(본문 + 메타 사이드바 + 활동 타임라인 + 이미지 갤러리 + 병합 안내).
6. 등록 폼 이미지 첨부(드래그·붙여넣기·파일·미리보기·삭제).
7. 목록 뷰 필터 바 + '중복'/이미지 badge + 뷰 토글.
8. 칸반 보드 뷰(`@dnd-kit` 드래그 앤 드롭 + 카드 + 낙관적 업데이트/롤백) + 중복처리 모달
   + TopBar "보드" 링크(tier 게이팅).
9. 브라우저 통합 검증.
