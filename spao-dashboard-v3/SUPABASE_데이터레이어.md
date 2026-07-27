# Supabase 데이터 레이어 정리 & 일자별 적재 전환 설계

**작성일**: 2026-07-07 · **기준**: 실제 코드(`supabase/schema.sql`, `src/utils/storage.js`, `src/utils/weekKey.js`) + 적용된 인증 마이그레이션(`auth_step1/2`)

---

## 1. 한눈에 보기 (As-Is)

```
[브라우저]
  엑셀 업로드 → parseExcel.js → payload(JS 객체)
  → gzip 압축(CompressionStream) → base64 → { "_gz": "H4sIAAAAA..." }
  → Supabase JS client (로그인 세션의 authenticated 권한)
  → upsert INTO weekly_snapshots (week_key 기준)

[Postgres/Supabase]
  weekly_snapshots  ← 유일한 화면 원천(주 1행)
  dashboard_state   ← 레거시 단일행(더 이상 신규 저장 경로 아님, 과거 마이그레이션 흡수용)
  weekly_snapshots_index ← payload 뺀 목록 전용 뷰(가벼운 인덱스 로딩)
```

- **저장 단위 = 1주(week)**. 한 주 = **1개 행**.
- **압축**: payload 전체를 gzip → base64 → **단일 문자열**로 저장(행 수와 무관하게 빠름). 실측: 15MB/86,650행 원본 저장 32초(타임아웃) → gzip 1.9MB 1.8초.
- **인증**: Supabase Auth 로그인 사용자(`authenticated`)만 읽기/쓰기 가능. 익명(`anon`)은 차단됨(2026-06-29 STEP2 적용 완료).

---

## 2. 테이블 스키마 (실제)

### 2-1. `weekly_snapshots` — 유일한 화면 원천 (주 단위)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `week_key` | `text` **PK** | 예 `"2026-W23"` — ISO 8601 주차(월요일 시작, 목요일 기준 연도). `weekKey.js`의 `isoWeekParts()`로 산출 |
| `week_label` | `text` | 예 `"6월 1주"` — 화면 표시용 한국어 라벨 |
| `week_start` | `date` | 그 주 월요일 |
| `week_end` | `date` | 그 주 일요일 |
| `payload` | `jsonb` | **한 주치 전체 데이터**. 실제 저장 형태는 `{ "_gz": "<base64 gzip>" }` (아래 3장) |
| `files_present` | `text[]` | 이 주에 업로드된 데이터셋 키 목록(예 `['sales','cart','coupon']`) |
| `uploaded_at` | `timestamptz` | 최초 저장 시각 |
| `updated_at` | `timestamptz` | 마지막 수정 시각 |
| `updated_by` | `text` | 수정자(현재 미사용, null) |

- 인덱스: `weekly_snapshots_start_idx` on `week_start`
- **upsert 키 = `week_key`** → 같은 주 재저장은 **전체 교체**(멱등)

### 2-2. `weekly_snapshots_index` — 목록 전용 뷰

`payload`(무거운 gzip 문자열)를 **뺀** 컬럼만 노출하는 뷰. 헤더의 주차 드롭다운이 전체 목록을 가볍게 불러올 때 사용(주 선택 전엔 payload를 로드하지 않음 — lazy loading).

```sql
select week_key, week_label, week_start, week_end,
       files_present, uploaded_at, updated_at, updated_by
from weekly_snapshots
order by week_start desc nulls last, week_key desc;
```

### 2-3. `dashboard_state` — 레거시 단일행 (신규 저장 경로 아님)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `int` **PK**(=1 고정) | 항상 1행만 존재(체크 제약) |
| `this_week` / `last_week` | `jsonb` | V2 시절의 "이번주/지난주" 단일 공유 데이터 |

- 주차 모델(V3) 전환 시 **1회성으로 `last_week`을 `weekly_snapshots`에 흡수**하는 마이그레이션 코드가 `App.jsx` 최초 마운트 효과에 남아 있음(멱등, 이미 없는 주만 채움).
- **현재는 신규 데이터가 이 테이블에 쓰이지 않는다** — 화면은 오직 `weekly_snapshots`만 읽음. 과거 호환용으로만 존재.

### 2-4. `payload` 내부 구조 (jsonb 안의 모양)

압축 해제하면 아래 형태(데이터셋 11종, 있는 것만 채워짐):
```json
{
  "sales":       { "sigma": {...}, "items": [...], "period": "06-01 ~ 06-07" },
  "cart":        { "sigma": {...}, "items": [...] },
  "wishlist":    { "sigma": {...}, "items": [...] },
  "customer":    { "sigma": {...}, "items": [...] },
  "salesByDate": { "sigma": {...}, "items": [...] },
  "visit":       { "items": [...] },
  "store":       { "items": [...] },
  "storeCorner": { "items": [...] },
  "search":      { "sigma": {...}, "items": [...] },
  "coupon":      { "sigma": {...}, "items": [...] },
  "restock":     { "items": [...], "totalCnt": 0, "productCount": 0, "skuCount": 0 }
}
```
필드 상세 스키마는 `PRD_데이터연동.md §8` / `N.E.E.D_연동_스키마정의서.xlsx` 참조.

---

## 3. 저장 형식 — gzip 압축 (핵심 설계 결정)

`payload` 컬럼은 위 3장 구조를 **그대로 저장하지 않는다.** 대신:

```
JSON.stringify(payload) → gzip(CompressionStream) → base64 → { "_gz": "H4sIAA..." }
```

- **이유**: Postgres `statement_timeout`(~8초)이 **행 수**에 비례해 걸림(jsonb 안 배열 행이 많을수록 직렬화 비용↑). gzip으로 **"행이 몇 개든 값은 문자열 1개"**로 만들어 이 문제를 원천 차단.
- **읽을 때** `decodePayload()`가 `_gz` 필드를 감지해 자동 압축 해제. 구버전 비압축 payload도 그대로 통과(하위 호환).
- **폴백**: `CompressionStream` 미지원 브라우저에서만 예산 기반 축약(`fitPayloadForCloud`, `budgetStoreCorner`)으로 저장 — 지금은 사실상 gzip 경로만 쓰임.

---

## 4. 인증·보안 레이어 (RLS)

| 시점 | 상태 |
|---|---|
| **최초 설계(schema.sql)** | `anon`(익명)에게 select/insert/update/delete 전부 허용 — "사내 도구 수준" |
| **STEP1(`auth_step1_add_authenticated.sql`)** | `authenticated`(로그인 사용자) 대상 정책 **추가**(비파괴) |
| **STEP2(`auth_step2_lockdown.sql`) — 적용 완료** | `anon` 정책 **전부 제거**. 이제 **로그인한 사용자만** 읽기/쓰기 가능. `weekly_snapshots_index` 뷰도 `security_invoker=true`로 anon 회수 |
| 롤백 경로 | `auth_rollback.sql` — 문제 시 STEP2 이전(anon 허용)으로 즉시 복구 가능 |

- 로그인: Supabase Auth(이메일+비밀번호), 자가가입 차단(관리자 생성 계정만).
- 데이터 쓰기 주체: **지금은 브라우저(로그인 사용자의 JWT)** 가 직접 upsert. (향후 자동 적재 시 아래 5장의 서버 경로로 이전 예정)

---

## 5. 지금 데이터가 들어오는 경로 (실제 흐름)

```
사람이 엑셀 업로드
  → App.jsx: parseFilesToUpdates() → detectFileKey() → PARSER_MAP[key](rows)
  → merged payload 구성
  → storage.js: upsertSnapshot({ weekKey, weekLabel, weekStart, weekEnd, payload, filesPresent })
  → gzip → { _gz } → supabase.from('weekly_snapshots').upsert(..., { onConflict: 'week_key' })
```
- `week_key`는 파일의 기간(period) 문자열에서 `deriveWeekKey()`(App.jsx)가 자동 산출, 실패 시 사용자가 `SnapshotSaveModal`에서 직접 지정.
- 클라이언트(브라우저)가 곧 "적재자"인 구조 — **아직 서버 사이드 자동 적재 파이프라인은 없음**(이게 이번 자동화 프로젝트의 목표).

---

## 6. 주차(Weekly) → 일자별(Daily) 적재로 전환 시 구조 변화

> 목표는 이미 `데이터자동화_멀티브랜드_요청서.md`에 정의한 대로 **"데이터팀 계약 = 순수 일별 파일(week_key 불필요) / 주차 묶기 = 우리 서버(Edge Function) 책임"**. 여기서는 그게 **Supabase 데이터 레이어 관점에서 구체적으로 무엇이 바뀌는지**를 정리한다.

### 6-1. 원칙 — 저장 스키마(테이블 구조)는 바뀌지 않는다
`weekly_snapshots`는 **그대로 유지**한다. 이유:
- 화면(L1~L4)이 읽는 단위는 여전히 "주" — 대시보드 코드 무변경.
- `week_key` PK, `payload`(gzip jsonb), `files_present`, 인덱스 뷰 — **전부 그대로**.

**바뀌는 것은 "그 행을 누가·언제·어떻게 채우느냐"** 뿐이다.

### 6-2. 신규 컴포넌트 — "일별 수신함" 계층 추가

```
[데이터팀] 매일 순수 일별 파일 드롭 (date 포함, week_key 불필요)
   ↓
[Supabase Storage: incoming/{date}/{dataset}.json]   ← 신규 (파일 저장소, DB 아님)
   ↓ (트리거 또는 pg_cron)
[Edge Function: daily-ingest]                          ← 신규
   1. 파일 읽기 · 스키마 검증(sigma=items 합 등)
   2. 파일의 date → isoWeekParts() 로 week_key 산출
   3. 그 주 weekly_snapshots 행을 "누적-전체교체"로 upsert
       - 기존 payload 압축 해제 → 해당 데이터셋만 그날치로 교체/병합 → 재압축 저장
   4. 성공: incoming/ → processed/ 이동 · 실패: error/ + 알림
   ↓
weekly_snapshots (기존 테이블, 무변경)
   ↓
대시보드 (무변경)
```

### 6-3. 무엇이 새로 생기고, 무엇이 그대로인가

| 구성요소 | Weekly(현재) | Daily 전환 후 |
|---|---|---|
| `weekly_snapshots` 테이블 | ✅ 사용 | ✅ **그대로 사용**(변경 없음) |
| `weekly_snapshots_index` 뷰 | ✅ 사용 | ✅ 그대로 |
| 적재 주체 | 브라우저(로그인 사용자) | **Edge Function(`service_role`)** — 신규 |
| 저장 트리거 시점 | 사람이 업로드 버튼 클릭 | **매일 자동**(파일 도착 또는 스케줄) |
| 필요한 신규 저장소 | 없음 | **Supabase Storage 버킷**(`incoming`/`processed`/`error`) — 신규 |
| week_key 산출 주체 | App.jsx(`deriveWeekKey`) | **Edge Function**(동일 로직을 서버에 이식) |
| 멱등 단위 | 주 전체 교체 | **주 전체 재구성**(그 주의 일별 누적본으로 다시 조립 후 교체) — 원칙은 동일(누적-전체교체) |
| 브라우저 쓰기 권한 | `authenticated`로 upsert 가능 | **점진적으로 읽기 전용화 권장**(쓰기는 서버로 일원화) — 6-5 참조 |

### 6-4. `payload` 병합 규칙 (일별 → 주 단위 재조립)

일자별로 도착한 데이터를 그 주의 `payload`(jsonb)에 반영하는 방식은 **데이터셋 성격에 따라 2갈래**:

| 데이터셋 | 날짜 보유 | 병합 방식 |
|---|---|---|
| `sales · salesByDate · visit · store · storeCorner · search · coupon` | ✅ `date` 필드 있음 | 그 주(월~일) 안에서 **날짜별 누적** — 매일 도착분을 이어붙여(`items` concat) 해당 데이터셋의 `sigma`도 재계산 |
| `cart · wishlist · customer` | ❌ 날짜 없음(기간 집계) | 매일 "그날까지 누계" 스냅샷으로 **덮어쓰기**(concat 아님) — 데이터팀과 합의된 방식에 따름 |
| `restock` | ❌ (잔량 스냅샷) | **매일 최신값으로 완전 교체**(합산 금지 — 재입고 대기는 흐름이 아니라 시점 값) |

> 이 규칙은 이미 대시보드 코드의 `mergePayloads()`(월/분기 기간 합산 기능, `src/utils/aggregatePeriod.js`)에 구현된 것과 **동일한 원칙**이다. Edge Function은 이 로직을 서버 버전으로 재사용/이식하면 된다.

### 6-5. 인증/쓰기 권한의 변화 (권장)

지금은 **브라우저(로그인한 사람)** 가 곧 쓰기 주체이지만, 자동 적재가 도입되면:

1. **과도기**: Edge Function(`service_role`)과 브라우저(`authenticated`) **둘 다** 쓰기 가능 — 자동 적재 실패 시 사람이 수동 업로드로 메꿀 수 있게 유지.
2. **안정화 후(권장)**: `weekly_snapshots`의 `authenticated` insert/update 정책을 **제거**하고 **select(읽기)만 남김**. 쓰기는 **Edge Function의 `service_role`로 일원화** → 데이터 정합성(검증을 항상 거침)과 감사 추적이 강화됨.
   - 이 경우 "수동 업로드" UI(주차 드롭다운의 파일 업로드)는 **관리자 전용 백업 경로**로 남기거나, `service_role`을 대신 호출하는 관리자 API로 우회.

### 6-6. 신규로 필요한 테이블/버킷 (요약)

| 신규 항목 | 용도 |
|---|---|
| Supabase Storage 버킷 `incoming` | 데이터팀이 매일 드롭하는 일별 원본 파일 (BO는 **쓰기 전용** 권한만) |
| Storage 폴더 `processed` / `error` | 처리 성공/실패 파일 아카이브 |
| (선택) 테이블 `ingest_log` | 일자별 적재 성공/실패 이력, 마지막 적재 시각 — 모니터링·알림용. 스키마 예: `id, dataset, date, status, error_message, ingested_at` |
| Edge Function `daily-ingest` | 파일 검증·주차 산출·`weekly_snapshots` upsert 담당 (코드, 테이블 아님) |

> `weekly_snapshots` 자체에는 **컬럼 추가가 필요 없다.** 정말 "일별 원문 그대로도 영구 보관"하고 싶다면 `ingest_log`나 별도 `daily_raw`(선택, SSOT 확장용) 테이블을 고려할 수 있으나, **필수는 아니다** — Storage의 `processed/` 아카이브가 원문 보관 역할을 이미 겸한다.

---

## 7. 결론

- **현재 데이터 레이어**: `weekly_snapshots`(주 1행, gzip jsonb payload, week_key upsert) 단일 테이블이 사실상 전부. `dashboard_state`는 레거시, 신규 미사용. 인증은 Supabase Auth + RLS(`authenticated`만)로 잠금 완료.
- **일자별 전환 시**: **테이블 스키마는 그대로**, **적재 계층(Storage 버킷 + Edge Function)만 새로 추가**되는 구조다. 화면(L1~L4)과 `weekly_snapshots`의 모양은 손대지 않고, "누가 이 행을 채우느냐"가 브라우저(사람)에서 Edge Function(자동)으로 바뀌는 것이 핵심 변화다.

### 참고 문서
- `PRD_데이터연동.md` — 데이터셋별 필드 스키마 상세
- `데이터자동화_멀티브랜드_요청서.md` — 데이터팀 요청 관점의 동일 설계(일배치 계약·역할분담)
- `N.E.E.D_연동_스키마정의서.xlsx` — N.E.E.D 메뉴 ↔ 데이터셋 매핑 + 필드별 스키마
