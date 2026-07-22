# 전사(멀티 브랜드) 요구사항 관리 웹앱 — 2단계 설계 문서

- 작성일: 2026-07-22
- 상태: 설계 승인 대기
- 선행: 1단계(진입/목록/등록) + UI 폴리싱 완료 (`feature/multibrand-requirements-app`)
- 위치: `agent/pj/`
- 상위 설계: `docs/superpowers/specs/2026-07-21-multibrand-requirements-mgmt-design.md`

## 배경 / 목적

1단계는 요구사항을 **등록**하고 **목록으로 보는** 것까지였다. 2단계는 등록된 요구사항을
**처리**하는 흐름을 추가한다: 2차(브랜드 관리자)가 새로 들어온 '대기' 건을 훑어보며
(Triage) 상태를 바꾸고, 담당자를 지정하고, 중복 요청을 하나로 병합한다. 모든 상태 변경은
이력(change_logs)으로 남겨 추적 가능하게 한다.

## 이번 단계 범위 요약

1. **Triage 인박스** (`/requirements/triage`) — 2차 이상 전용. '대기' 큐를 인라인 처리.
2. **요구사항 상세 페이지** (`/requirements/[id]`) — 본문 + 상태변경 이력 + 병합된 요청자.
3. **상태 변경** — 자유 드롭다운 전이, change_logs 기록, `completed_at` 자동 처리.
4. **담당자 지정** — 2차 이상이 지정(이력 미기록).
5. **중복 병합** — 2차가 중복 건을 기존 건에 병합. pg_trgm 기반 유사 후보 자동 제시.
6. **identity에 tier 심기** — "2차에게만 노출" UI 분기를 위한 선행 작업.

### 범위 제외 (3단계 이후로 미룸)

- 인앱 알림(요청자에게 "당신 요청이 병합됨" 통지) — 4단계.
- 담당자 변경 이력 기록 — 이번 단계는 상태 변경만 기록.
- 의미 기반(임베딩/pgvector) 중복 탐지 — pg_trgm으로 부족하다고 판단되면 별도 단계.
- "내 요청만" 뷰 / 저장된 필터 뷰 — 4단계.
- 브랜드/카테고리/워크플로 설정 화면, 통합 대시보드 — 3단계.
- 자동 병합(사람 확인 없이 로직만으로 병합) — 명시적 비목표. 오탐이 멀쩡한 요청을
  파괴하므로 절대 도입하지 않는다. 로직은 **후보 제시**까지만 한다.

## 데이터 모델 변경 (마이그레이션 0002)

기존 `change_logs`, `duplicate_links` 테이블은 1단계에 이미 생성되어 있어 스키마 변경이
없다. 변경 사항은 두 가지뿐이다.

1. **`requirements.status` CHECK 제약에 `'중복'` 추가**

   현재(0001): `check (status in ('대기','요청','검토','정책정의','진행중','완료'))`
   변경 후: `... in ('대기','요청','검토','정책정의','진행중','완료','중복')`

   (기존 CHECK 제약을 drop 후 재생성하는 마이그레이션.)

2. **pg_trgm 확장 활성화** — `create extension if not exists pg_trgm;`
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
"2차에게만 Triage 메뉴 노출" 같은 UI 분기가 불가능하다. 다음을 확장한다.

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
- **상태 변경 / 담당자 지정 / 중복 병합 / 유사 후보 조회 / Triage 인박스 조회**: 2차 이상만.
- **상세 조회**: 3차 포함 조회 가능. 단 비공개(`is_confidential`) 건은 3차 접근 시 서버가
  403 (목록에서 이미 숨기지만, URL 직접 접근도 서버에서 차단).
- **상세 페이지 쓰기 컨트롤**(상태/담당자 드롭다운, 병합 버튼): 3차에게는 렌더링하지 않고,
  서버 API도 3차 요청을 403으로 거부.

## API 설계 (2단계)

기존 컨벤션(라우트 하나당 단일 책임)을 따른다.

- **`GET /api/requirements?brandId=&memberId=&status=대기`** — 기존 목록 API에 선택적
  `status` 필터만 추가. Triage 인박스가 `status=대기`로 이 API를 재사용한다. `status`
  미지정 시 기존과 동일(전체, 단 confidential 필터 적용).
  - 기본 목록에서는 `status='중복'` 건을 숨기지 않는다(아래 "병합 동작" 참고).

- **`GET /api/requirements/[id]?memberId=`** — 상세. 한 번의 응답으로:
  - `requirement`: 본문 전체(+ requester/category/assignee 조인).
  - `history`: `change_logs where requirement_id = id` (created_at 오름차순).
  - `duplicates`: `duplicate_links where requirement_id = id` (병합되어 들어온 요청자들).
  - `mergedInto`: 이 건이 status='중복'이면 대상 `{id, title}`, 아니면 null.
  - 검증: `requireBrandAccess('3차')` + 비공개면 3차 차단.

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

모든 응답 에러는 `{ error: string }` + 적절한 HTTP status(400/403/404/500).

## 병합 동작 & 가시성 ("사라지지 않게")

- 병합된 중복 건은 `status='중복'`이 되지만, 브랜드 전체 목록(`/requirements`)에서
  **숨기지 않는다.** 현재 목록은 "브랜드 전체" 뷰이고 "내 요청만" 뷰가 없어, 숨기면
  요청자가 자기 요청이 사라진 것처럼 느낀다.
- 대신 목록에서 **흐리게(muted) 표시 + "→ '<대상>'에 병합됨" 표기**로 남긴다. 상태 badge
  '중복'은 회색(muted) 스타일.
- Triage 인박스(`status=대기`)에는 '중복' 건이 애초에 안 들어온다(대기가 아니므로).
- 장래에 목록이 지저분해지면 "중복 숨기기" 토글을 추가할 수 있으나 이번 범위 밖.

## UI

### Triage 인박스 (`/requirements/triage`)

- **접근**: 2차 이상만. TopBar에 "Triage" 링크를 tier가 2차 이상일 때만 노출. 3차가 URL로
  직접 진입하면 안내 문구 + 목록으로 돌려보냄(서버 API도 403).
- **내용**: 해당 브랜드의 `status='대기'` 요구사항. 정렬은 **요청일 오름차순**(오래
  방치된 건이 위로).
- **인라인 처리**(행 안에서 바로):
  - 상태 드롭다운 — 변경 시 `PATCH .../status` 호출, 성공하면 그 행은 '대기'가 아니게
    되므로 큐에서 사라짐.
  - 담당자 드롭다운 — `PATCH .../assignee`.
  - "중복처리" 버튼 — 중복처리 모달을 연다.
- 제목 클릭 시 상세 페이지로 이동.
- 데스크톱은 테이블, 모바일은 카드형(기존 목록과 동일한 반응형 패턴).

### 중복처리 모달

- Triage 행의 "중복처리" 버튼 → 모달.
- 모달 상단: `GET .../similar`로 받은 **유사 후보 목록**(유사도 순, 각 항목에 제목·요청자·
  상태·유사도). 클릭해 대상 선택.
- 모달 하단: 유사 후보에 없을 때를 대비한 **수동 검색**(같은 브랜드 요구사항 제목 검색).
- 대상 선택 후 "병합" → `POST .../merge`. 성공 시 모달 닫고 Triage 목록 새로고침.
- 확인 단계: "이 요청을 '<대상>'에 병합합니다. 되돌릴 수 없습니다." 경고 표시.

### 요구사항 상세 페이지 (`/requirements/[id]`)

- 목록/Triage 행 클릭으로 진입.
- **본문**: 제목, 상태 badge, 요청자/담당자/카테고리/요청일/우선순위/긴급도, As-Is,
  To-Be, 비고, 비공개 여부.
- **상태변경 이력 타임라인**: `history`를 시간순으로 "OOO님이 [이전]→[이후] (일시)".
- **병합된 요청자**: `duplicates`가 있으면 "이 요청에 병합된 요청: XXX(제목) — 요청자 OOO".
- **병합 안내**: 이 건이 '중복'이면 상단에 "이 요청은 '<대상>'에 병합되었습니다" +
  대상 상세로 가는 링크.
- **쓰기 컨트롤**(2차 이상만): 상태 드롭다운, 담당자 드롭다운. 3차는 읽기 전용.

### 목록/상세 badge

- `RequirementList`의 `STATUS_STYLES`에 `중복: 'bg-slate-100 text-slate-400'`(muted) 추가.
- 기본 목록에서 '중복' 행은 흐리게 + "→ 병합됨" 표기.

## 에러 처리 / 검증

- 쓰기 라우트: 필수 필드 누락 400, tier 미달 403, 대상/리소스 없음 404, 유효하지 않은
  status 400, 병합 규칙 위반 400.
- 상세 GET: 비공개+3차 403, 없는 id 404.
- 클라이언트: 인라인 처리 실패 시 해당 행/모달에 에러 메시지, 낙관적 업데이트는 하지 않고
  성공 응답 후 갱신(상태 불일치 방지).

## 테스트 전략

- **순수 로직 Vitest**(1단계 패턴 계승):
  - `computeCompletedAt(oldStatus, newStatus, prevCompletedAt)` — 완료 진입/이탈/유지 케이스.
  - `validateMerge({ sourceId, targetId, sourceStatus, targetStatus, sameBrand })` — 자기병합·
    이미중복·대상중복·타브랜드·정상 케이스.
  - `checkBrandAccess` 기존 테스트에 '2차 이상' 판정 경로가 이미 커버됨(재확인).
- **UI 플로우**: dev 서버 + 실제 브라우저로 진입→Triage→상태변경→담당자→중복병합→상세
  이력 확인까지 직접 검증(자동 e2e는 이 단계에서도 미도입).

## 구현 순서 개요 (상세는 구현 계획에서)

1. 마이그레이션 0002('중복' status + pg_trgm) 및 Supabase 적용.
2. identity tier 심기(my-brands 응답 + 진입화면 + identity 형태).
3. 순수 로직 + 단위 테스트(computeCompletedAt, validateMerge).
4. API 라우트(status, assignee, merge, detail, similar, list status 필터).
5. 상세 페이지.
6. Triage 인박스 + 인라인 컨트롤 + 중복처리 모달.
7. 목록 '중복' badge/표기 + TopBar Triage 링크(tier 게이팅).
8. 브라우저 통합 검증.
