# 목표 대비 · 전년 비교 스코어보드 설계

## 목표

종합진단(L1_HealthCheck) 화면 상단, 기존 매출 스코어보드 바로 아래에 "🎯 목표 대비 · 전년 비교" 섹션을 추가한다. 매출·전환율·객단가(AOV) 3개 지표 각각에 대해 ① 이번 기간 실적값, ② 목표 대비 달성률(진행률 바), ③ 전년 동요일 대비 증감을 한 타일에 모아 보여준다.

목표값과 작년 실적은 MD가 수기로 관리하는 구글 시트(`https://docs.google.com/spreadsheets/d/1yialQ3E-BoqLcr9WSjncdVpf0KkDgLYWS8xq9tOw6Z8`)에서 가져온다. 이번 기간의 실적값 자체는 시트가 아니라 기존 N.E.E.D 엑셀 파이프라인이 이미 계산해 둔 숫자(`salesByDateMetrics`/`cartDerived`)를 그대로 재사용한다 — 실적이 두 곳에서 따로 관리되면 숫자가 어긋날 수 있기 때문이다.

## 아키텍처 개요

`ga4-pull`과 동일한 패턴: 새 Supabase Edge Function이 주기적으로 구글 시트를 읽어 Supabase 테이블에 upsert하고, 프론트엔드는 그 테이블만 읽는다. 다만 구글 시트가 "링크가 있는 모든 사용자" 보기 권한으로 공유돼 있어(직접 CSV export URL로 로그인 없이 fetch 확인 완료), GA4 파이프라인처럼 서비스계정 JWT/OAuth를 만들 필요가 없다 — 공개 CSV export 엔드포인트를 그냥 fetch하면 된다. 그만큼 훨씬 단순한 파이프라인이다.

```
구글 시트(목표값 탭 + 전년 비교 탭)
      │ CSV export (공개, 인증 불필요)
      ▼
sheet-target-pull (Edge Function, 매일 1회 cron)
      │ upsert
      ▼
daily_target / daily_last_year_actual (Supabase 테이블)
      │ select (기간 필터)
      ▼
getTargetProgressData() (storage.js)
      │
      ▼
TargetProgressSection (L1_HealthCheck.jsx 하위 컴포넌트)
```

## 데이터 원천: 구글 시트

CSV export URL 패턴 (인증 불필요, 실제 curl로 응답 확인 완료):

```
https://docs.google.com/spreadsheets/d/1yialQ3E-BoqLcr9WSjncdVpf0KkDgLYWS8xq9tOw6Z8/gviz/tq?tqx=out:csv&sheet=<URL인코딩된_탭이름>
```

- 목표값 탭: `sheet=%EB%AA%A9%ED%91%9C%EA%B0%92`
- 전년 비교 탭: `sheet=%EC%A0%84%EB%85%84%20%EB%B9%84%EA%B5%90`

### `목표값` 탭 (161행, 헤더 1행 + 데이터 160행)

응답 예시(따옴표 포함 원본):
```
"2026-05-01(금)","200,000,000","","","90909.091","4%","55000","200,000,000","",...
```

사용하는 컬럼(A=1번째):
| 컬럼 | 내용 | 예시 값 | 비고 |
|---|---|---|---|
| A | 일자 | `2026-05-01(금)` | 앞 10자 `2026-05-01`이 ISO 날짜 |
| B | 목표합계(매출 목표) | `200,000,000` | 콤마 포함 문자열 |
| E | 유입 목표 | `90909.091` | 콤마 없음(소수) |
| F | 전환율 목표 | `4%` | % 기호 포함 |
| G | 객단가 목표 | `55000` | 콤마 없음(정수) |

C, D, H, I열은 사용하지 않는다(H=월별목표합계 누적값은 프론트에서 기간별로 직접 합산하므로 불필요, C/D/I는 항상 빈 값). 시트 끝부분에 일자가 빈 잉여 행이 섞여 있어(꼬리에 `"0"`만 있는 행 확인됨) A열이 `YYYY-MM-DD` 패턴에 안 맞으면 그 행은 건너뛴다.

### `전년 비교` 탭 (384행, 헤더 1행 + 데이터 383행)

응답 예시:
```
"2025-05-01(목)","56219969","1,108","2,489","36,258","3.10%","50,740","","",...
```

사용하는 컬럼:
| 컬럼 | 내용 | 예시 값 |
|---|---|---|
| A | 일자 | `2025-05-01(목)` |
| B | 결제합계(실적) | `56219969` |
| C | 주문수 | `1,108` |
| E | 유입 | `36,258` |
| F | 전환율 | `3.10%` |
| G | 객단가 | `50,740` |

D(품목수), H(상품구매금액), I(배송비) 및 그 뒤 헬퍼 컬럼들은 사용하지 않는다.

### 파싱 규칙 (Edge Function 내부)

- **날짜**: `dateStr.slice(0, 10)` 후 `/^\d{4}-\d{2}-\d{2}$/` 매치 안 되면 그 행 skip.
- **숫자(콤마 포함)**: `parseFloat(str.replace(/,/g, ''))`. 빈 문자열이면 0.
- **퍼센트**: `parseFloat(str.replace('%', ''))` → 그대로 "퍼센트 단위 숫자"(예: `4%` → `4`)로 저장한다. DB에도 소수(0.04)가 아니라 4로 저장 — 프론트의 `fmtPct` 계열 함수들이 이미 "퍼센트 단위 숫자"를 입력으로 받는 관례이기 때문(GA4Tab의 `convRate` 등과 동일 관례).
- CSV 자체는 표준 큰따옴표-콤마 이스케이프 규칙을 따르므로(값 안에 콤마가 있으면 `"1,234"`처럼 통째로 감싸짐), 정규식으로 대충 split하지 말고 따옴표를 인식하는 최소 CSV 파서를 직접 구현한다(따옴표 안의 콤마는 구분자로 취급하지 않고, `""`는 이스케이프된 `"` 한 글자로 치환).

## Supabase 테이블

`spao-dashboard-v3/supabase/sheet_target_pull_tables.sql`:

```sql
create table if not exists public.daily_target (
  stat_date date primary key,
  revenue_target numeric not null default 0,
  sessions_target numeric not null default 0,
  conv_rate_target numeric not null default 0,   -- 퍼센트 단위 숫자 (4 = 4%)
  aov_target numeric not null default 0,
  _ingested_at timestamptz not null default now()
);

create table if not exists public.daily_last_year_actual (
  stat_date date primary key,                     -- 작년 실제 달력 날짜 (예: 2025-05-01)
  revenue numeric not null default 0,
  orders numeric not null default 0,
  sessions numeric not null default 0,
  conv_rate numeric not null default 0,            -- 퍼센트 단위 숫자
  aov numeric not null default 0,
  _ingested_at timestamptz not null default now()
);

alter table public.daily_target enable row level security;
alter table public.daily_last_year_actual enable row level security;

create policy "daily_target_select_authenticated" on public.daily_target
  for select to authenticated using (true);
create policy "daily_last_year_actual_select_authenticated" on public.daily_last_year_actual
  for select to authenticated using (true);
-- insert/update/delete는 service_role만 (Edge Function이 service_role 키로 upsert) — 별도 정책 불필요(RLS는 authenticated에만 select 허용, service_role은 RLS 우회).
```

기존 `daily_ga4_*` 테이블들과 동일한 RLS 패턴(authenticated는 읽기만, 쓰기는 service_role 경유).

## Edge Function: `sheet-target-pull`

파일: `spao-dashboard-v3/supabase/functions/sheet-target-pull/index.ts`

- 호출: `POST /functions/v1/sheet-target-pull` (또는 Dashboard 배포 시 이 세션의 기존 관례대로 `super-*` 형태의 난독화된 별칭을 붙여도 무방 — 배포 시점에 사용자가 정한다)
- 인증: 기존 `INGEST_KEY` 시크릿 재사용(`x-ingest-key` 헤더) — 이 함수의 Secrets에도 동일한 값을 등록해야 한다(함수별로 Secrets가 분리돼 있으므로).
- 바디: 없음(항상 시트 전체를 다시 읽어 upsert — 시트 자체가 작아서(최대 수백 행) 날짜 범위로 쪼갤 필요가 없다. `ga4-pull`처럼 최근 7일만 갱신하는 방식이 아니라 매번 풀스캔).
- 로직:
  1. `목표값` 탭 CSV fetch → 파싱 → `daily_target` upsert(`onConflict: 'stat_date'`).
  2. `전년 비교` 탭 CSV fetch → 파싱 → `daily_last_year_actual` upsert(`onConflict: 'stat_date'`).
  3. 응답: `{ ok: true, targetRows: N, lastYearRows: N }`.
  4. 각 단계 실패 시 `{ ok: false, error }`(500) — `ga4-pull`과 동일한 에러 처리 패턴.
- 별도 백필 스크립트 불필요 — 매번 전체를 다시 읽으므로 최초 1회 Test 탭 실행만으로 시트에 있는 모든 과거/미래 날짜가 채워진다.

## Cron

`spao-dashboard-v3/supabase/sheet_target_pull_cron.sql` — 기존 `ga4-pull-daily`와 동일한 패턴, 이미 Vault에 저장된 `ingest_key` 시크릿을 재사용한다. 매일 1회, 시트가 수기 관리라 트래픽이 실시간으로 변하지 않으므로 GA4 파이프라인과 겹치지 않는 시간대(예: 06:10 KST = 전날 21:10 UTC)로 스케줄한다. `timeout_milliseconds`는 CSV 2회 fetch뿐이라 가볍지만 여유 있게 15000으로 설정(GA4의 30000보다는 작게 — 실제 부하가 훨씬 적으므로).

```sql
select cron.schedule(
  'sheet-target-pull-daily',
  '10 21 * * *',  -- 매일 06:10 KST
  $cron$
  select net.http_post(
    url     := 'https://wtflegxxhmzcofojepuf.supabase.co/functions/v1/sheet-target-pull',  -- 배포 시 다른 별칭을 쓰기로 하면 이 URL만 바꾸면 됨
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
```

## 프론트엔드

### `src/utils/storage.js` — `getTargetProgressData(periodStart, periodEnd)`

```
입력: periodStart, periodEnd (ISO 'YYYY-MM-DD', 상단 주/월/분기 필터가 결정한 이번 기간의 시작~끝)
동작:
  1. lyStart/lyEnd = periodStart/periodEnd 각각에서 364일(52주) 빼기 → "동요일 매칭" 작년 구간.
     (364 = 52×7이므로 요일이 항상 동일하게 맞음. 예: 8/26(수) → 작년 8/27(수))
  2. daily_target에서 stat_date가 [periodStart, periodEnd]인 행 조회.
  3. daily_last_year_actual에서 stat_date가 [lyStart, lyEnd]인 행 조회.
  4. 목표값 집계:
     - revenueTarget = SUM(revenue_target)
     - convRateTarget = AVG(conv_rate_target)   -- 목표는 MD가 설정한 "비율값" 그 자체라 일별 평균이 자연스러움(합산 대상 아님)
     - aovTarget = AVG(aov_target)
  5. 작년 실적 집계 (실측치라 SUM/SUM 가중 평균 — GA4Tab과 동일 원칙: "전환율은 SUM(주문)/SUM(유입)로 계산, 일별 평균 내지 않는다"):
     - lyRevenue = SUM(revenue)
     - lyOrders = SUM(orders)
     - lySessions = SUM(sessions)
     - lyConvRate = lySessions > 0 ? lyOrders / lySessions * 100 : null
     - lyAov = lyOrders > 0 ? lyRevenue / lyOrders : null
반환: { revenueTarget, convRateTarget, aovTarget, lastYear: { revenue: lyRevenue, convRate: lyConvRate, aov: lyAov }, hasTarget: targetRows.length > 0, hasLastYear: lyRows.length > 0 }
```

`sessions_target`(유입 목표)은 테이블에는 저장하지만 이번 3타일 UI에는 노출하지 않는다(이번 스코프는 매출/전환율/객단가 3개로 확정됨 — 유입 목표는 향후 필요해지면 그때 타일을 추가한다).

두 조회 모두 실패(row 없음)해도 예외를 던지지 않고 `hasTarget`/`hasLastYear`를 false로 반환 — 시트에 아직 없는 미래 기간을 조회하거나 작년 동기간 데이터가 비어 있어도 화면이 깨지지 않게 한다.

### `src/components/TargetProgressSection.jsx` (신규 파일)

`L1_HealthCheck.jsx`가 이미 1300줄 이상으로 큰 파일이라, 이번에 추가하는 섹션은 별도 파일로 분리한다(브레인스토밍 원칙 — 새로 추가하는 단위는 독립적으로 이해 가능하게).

Props: `{ periodStart, periodEnd, revenue, convRate, aov }` — 뒤 3개(`revenue`/`convRate`/`aov`)는 "이번 기간 실적"으로, `L1_HealthCheck`가 이미 갖고 있는 `salesByDateMetrics`/`cartDerived` 기반 값을 그대로 내려받는다(별도 계산 안 함 — `QuickSummary`가 쓰는 것과 동일한 소스: `totalRev = kpis?.[0]?.rawValue`, `aov = salesByDateMetrics?.aov ?? cartDerived?.aov`, `cartConv = cartDerived?.cartConvRate`).

내부에서 `getTargetProgressData(periodStart, periodEnd)`를 `useEffect`로 호출(GA4Tab과 동일한 로딩 패턴: `useState(null)` → `useEffect`에서 fetch).

렌더링: 헤더("🎯 목표 대비 · 전년 비교") + 3개 타일(매출/전환율/객단가), 각 타일 공통 구조:
1. 라벨 + 실적값(큰 글씨, `fmt억`/`fmtPct`/`fmtComma`+"원")
2. 목표 대비 진행률 바 — `width: min(100, actual/target*100)%`, 옆 텍스트로 실제 달성률(100% 초과 가능, 예: "106% 달성") + "(목표 X 중)" 보조 텍스트. `hasTarget`이 false면 바 대신 "목표 데이터 없음" 표시.
3. 전년 동요일 대비 배지 — `WoWBadge` 재사용. 매출/객단가는 `kind='pct'`로 `(actual - lastYear.value) / lastYear.value * 100`(증감률 %), 전환율은 `kind='pp'`로 `actual - lastYear.convRate`(포인트 차이 %p) — 브레인스토밍에서 확정한 대로 매출·객단가는 %, 전환율은 %p 단위 구분. `hasLastYear`가 false거나 `lastYear.value`가 0/null이면 배지 대신 "작년 데이터 없음"으로 대체.

진행률 바 색상: 매출 `#E8710A`(주황), 전환율 `#5DCAA5`(초록), 객단가 `#378ADD`(파랑) — 목업에서 확인한 배색 그대로.

### `src/components/L1_HealthCheck.jsx`

`SalesScoreboard`와 WoW 안내 배너 사이에 삽입:

```jsx
<SalesScoreboard ... />

{periodStart && periodEnd && (
  <TargetProgressSection
    periodStart={periodStart}
    periodEnd={periodEnd}
    revenue={kpis?.[0]?.rawValue || 0}
    convRate={cartDerived?.cartConvRate || 0}
    aov={salesByDateMetrics?.aov ?? cartDerived?.aov ?? 0}
  />
)}

{hasWoW ? ( ... WoW 안내 배너 ... ) : ( ... )}
```

`L1_HealthCheck`는 새 props `periodStart`/`periodEnd`(옵셔널)를 받는다. 이 값이 없으면(예: 키즈 필터 화면) 섹션 자체를 렌더링하지 않는다 — 키즈 필터는 전사 목표와 무관한 부분집합 뷰라 목표 대비 지표를 보여줄 대상이 아니다.

### `src/App.jsx`

현재 `activeTab === 'ga4'` 블록 안에만 있는 기간 범위 계산 로직(주/월/분기 모드에 따라 `range`/`label` 계산)을 함수로 추출해 `L1_HealthCheck` 렌더 지점에서도 재사용한다:

```js
function computeSelectedRange(periodMode, periodKey, selectedWeekKey, snapshotIndex) {
  if (periodMode === 'week') {
    const meta = snapshotIndex.find(r => r.week_key === selectedWeekKey)
    return {
      range: meta?.week_start && meta?.week_end ? { start: meta.week_start, end: meta.week_end } : null,
      label: meta?.week_label || null,
    }
  }
  const weeks = periodKey ? weekKeysInPeriod(snapshotIndex, periodMode, periodKey) : []
  return {
    range: dateRangeOfWeeks(snapshotIndex, weeks),
    label: periodKey ? periodLabel(periodKey, periodMode) : null,
  }
}
```

기존 GA4 탭 블록의 `range`/`label` 계산 부분(prevRange 계산 제외 — GA4 탭만 WoW용 prevRange가 필요, L1은 필요 없음)을 이 함수 호출로 교체하고, `L1_HealthCheck` 렌더 지점(752번째 줄 부근, 메인 호출만 — 키즈 호출은 제외)에서도 같은 함수로 `range`를 구해 `periodStart={range?.start} periodEnd={range?.end}`로 내려준다.

## 에러/경계 처리

- 시트 공유 설정이 나중에 "비공개"로 바뀌면 CSV fetch가 401/403을 반환하며 파이프라인 전체가 실패한다 — Edge Function은 `{ ok:false, error }`로 명확히 응답하니 Test 탭에서 바로 드러난다. (운영 중 시트 공유 권한이 바뀌면 재확인 필요 — 문서로만 남겨두고 별도 알림 체계는 이번 스코프에 넣지 않는다.)
- 목표 시트에 아직 없는 미래 날짜(예: 시트 갱신이 밀린 경우)를 조회하면 `hasTarget=false`로 "목표 데이터 없음" 표시.
- 작년 동기간 데이터가 없는 경우(전년 비교 탭 범위 밖) `hasLastYear=false`로 해당 배지만 "작년 데이터 없음" 처리, 목표 대비 진행률 바는 정상 표시.
- 진행률 바가 100%를 넘는 목표 초과 달성 시 바 자체는 100%에서 채우고, 텍스트로만 실제 초과율(예: "106% 달성")을 보여준다(목업에서 확정).

## 테스트

- `storage.test.js`에 `getTargetProgressData`의 364일 오프셋 계산(날짜 산술)과 SUM/AVG 집계 로직에 대한 유닛 테스트 추가.
- Edge Function의 CSV 파서(따옴표/콤마 이스케이프 처리)와 퍼센트/숫자 파싱 함수는 순수 함수로 분리해 `esbuild` 구문 체크 + 로직은 수동 배포 후 Test 탭으로 실측 검증(이 프로젝트의 기존 관례 — Deno 함수는 로컬에 deno CLI가 없어 유닛 테스트 프레임워크를 못 돌리고, Supabase Dashboard 배포 후 실제 호출로 검증해왔다).
