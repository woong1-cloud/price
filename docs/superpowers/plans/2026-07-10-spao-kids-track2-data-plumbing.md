# 스파오 키즈 트랙2 — 데이터 배관(자사몰+이랜드몰 어댑터) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키즈 전용 대시보드(트랙2)의 데이터 배관 중 지금 바로 확정 가능한 두 채널 — 자사몰(N.E.E.D 재사용)과 이랜드몰(업로드 브릿지) — 을 공통 테이블 `kids_channel_daily`(일자×채널)에 적재되게 만든다.

**Architecture:** Supabase에 `kids_channel_daily` 테이블을 새로 만들고, ① 자사몰은 이미 자동 수집 중인 `daily_sales`(itemAggrList)에 매출 컬럼을 보강한 뒤 스타일코드 성별코드=`K`로 필터링하는 SQL 집계 함수를 pg_cron으로 주기 실행해 채우고, ② 이랜드몰은 사람이 다운로드하는 주문상세 엑셀을 파싱→집계하는 순수 JS 유틸(신규 `spao-kids-dashboard` 앱의 씨앗)을 만들어 같은 테이블에 업서트한다.

**Tech Stack:** Supabase(Postgres SQL, pg_cron), Deno Edge Function(기존 `need-ingest` 확장), Vitest(순수 JS 유닛 테스트), `@supabase/supabase-js`.

**스코프 밖(후속 계획으로 분리):**
- 네이버 커머스 API 연동 — 키즈 전용 셀러 계정의 실제 API 자격증명이 있어야 엔드투엔드 검증이 가능해 별도 계획으로 분리한다.
- 화면(UI) — 이 계획은 `kids_channel_daily` 테이블까지 채우는 데이터 배관만 다룬다. 화면은 최소 한 채널의 데이터가 실제로 쌓인 뒤 별도 계획으로 진행한다.

**중요 — 검증 필요 가정(코드에도 주석으로 남김):**
1. `daily_sales.model_no` = 스타일코드. (근거: `supabase/daily_staging_tables.sql:49`의 기존 주석 `model_no text, -- 스타일코드`)
2. itemAggrList의 매출 필드명은 salesDaily(`daily_sales_by_date`)와 같은 명명 규칙(`ord_count`/`ord_amount`/`realord_count`/`realord_amount`/`real_sale_amount`/`cancel_takeback_qty`/`cancel_takeback_amount`)을 따른다고 가정한다. 실제 itemAggrList 원본 JSON 1건이 확보되면 Task 2 완료 후 필드명이 맞는지 재확인해야 한다(맞지 않으면 `need-ingest/index.ts`의 map만 고치면 되고 테이블 구조는 그대로 재사용 가능).
3. 이랜드몰 "판매금액" 컬럼은 라인 합계(단가×수량)라고 가정한다(관찰한 샘플이 전부 수량=1이라 단가와 값이 같아 구분이 안 됨). 수량>1인 실제 행이 확보되면 Task 6에서 이 가정을 재검증한다.

---

### Task 1: `kids_channel_daily` 테이블 생성

**Files:**
- Create: `spao-dashboard-v3/supabase/kids_track2_step1_channel_daily.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- ════════════════════════════════════════════════════════════════════════
-- 키즈 트랙2 — 일자×채널 공통 실적 테이블
-- ────────────────────────────────────────────────────────────────────────
-- 목적: 자사몰·이랜드몰·네이버 3채널의 "당일/당월" 실적을 하나의 스키마로 통합.
--       weekly_snapshots(gzip jsonb, 주 단위 수기 업로드용)와 달리 API/업로드로
--       매일 들어오는 구조라 평범한 관계형 테이블로 둔다.
-- 키:   (stat_date, channel) upsert — 같은 날 재적재해도 멱등.
-- 권한: authenticated 읽기만. 쓰기는 service_role(Edge Function/집계 함수)만.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.kids_channel_daily (
  stat_date        date not null,
  channel          text not null check (channel in ('자사몰', '이랜드몰', '네이버')),
  order_cnt        int not null default 0,
  order_amt        bigint not null default 0,
  real_order_cnt   int not null default 0,
  real_amt         bigint not null default 0,
  cancel_amt       bigint not null default 0,
  discount_amt     bigint,
  _source          text,  -- 어느 어댑터가 채웠는지 (예: 'sales_daily_agg' | 'eland_upload' | 'naver_api')
  _ingested_at     timestamptz not null default now(),
  primary key (stat_date, channel)
);

create index if not exists idx_kids_channel_daily_date on public.kids_channel_daily (stat_date);

alter table public.kids_channel_daily enable row level security;
drop policy if exists "auth read kids_channel_daily" on public.kids_channel_daily;
create policy "auth read kids_channel_daily" on public.kids_channel_daily
  for select to authenticated using (true);
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 > SQL Editor 에 위 파일 전체를 붙여넣고 RUN.

- [ ] **Step 3: 테이블 생성 확인**

SQL Editor에서 실행:
```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'kids_channel_daily'
order by ordinal_position;
```
Expected: `stat_date`(date), `channel`(text), `order_cnt`(integer), `order_amt`(bigint), `real_order_cnt`(integer), `real_amt`(bigint), `cancel_amt`(bigint), `discount_amt`(bigint), `_source`(text), `_ingested_at`(timestamp with time zone) — 총 10개 행.

- [ ] **Step 4: 커밋**

```bash
git add spao-dashboard-v3/supabase/kids_track2_step1_channel_daily.sql
git commit -m "feat: 키즈 트랙2 kids_channel_daily 테이블 추가"
```

---

### Task 2: `daily_sales`(itemAggrList) 매출 컬럼 보강 + `need-ingest` 매핑 확장

**Files:**
- Create: `spao-dashboard-v3/supabase/kids_track2_step2_daily_sales_columns.sql`
- Modify: `spao-dashboard-v3/supabase/functions/need-ingest/index.ts:49-57`

**배경**: `daily_sales` 테이블(현재 `supabase/daily_staging_tables.sql:45-57`)과 `need-ingest`의 `itemAggrList` 매핑에는 매출/수량 필드가 아예 없다(`itemview_count`/`cart_qty_sum`/`conversion_rate`만 있음) — `NEED_JSON_자동화_제안.md`에서 이미 "확인 필요"로 남겨둔 갭이다. `daily_sales_by_date`(salesDaily)와 같은 명명 규칙으로 컬럼을 보강한다.

- [ ] **Step 1: 컬럼 추가 SQL 작성**

```sql
-- ════════════════════════════════════════════════════════════════════════
-- daily_sales(itemAggrList) 매출/수량 컬럼 보강
-- ────────────────────────────────────────────────────────────────────────
-- daily_sales_by_date(salesDaily)와 동일한 명명 규칙을 따른다고 가정(주석 참고).
-- 실제 itemAggrList 원본 JSON 1건이 확보되면 필드명이 맞는지 재확인할 것.
-- ════════════════════════════════════════════════════════════════════════

alter table public.daily_sales
  add column if not exists ord_count int,
  add column if not exists ord_qty int,
  add column if not exists ord_amount bigint,
  add column if not exists realord_count int,
  add column if not exists realord_qty int,
  add column if not exists realord_amount bigint,
  add column if not exists real_sale_amount bigint,
  add column if not exists cancel_takeback_qty int,
  add column if not exists cancel_takeback_amount bigint;
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.

- [ ] **Step 3: 컬럼 추가 확인**

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'daily_sales'
  and column_name in ('ord_count','ord_qty','ord_amount','realord_count','realord_qty','realord_amount','real_sale_amount','cancel_takeback_qty','cancel_takeback_amount')
order by column_name;
```
Expected: 9개 행 전부 나옴.

- [ ] **Step 4: `need-ingest/index.ts`의 `itemAggrList` map 확장**

`spao-dashboard-v3/supabase/functions/need-ingest/index.ts:49-57`을 아래로 교체:

```typescript
  itemAggrList: {
    table: 'daily_sales',
    keys: ['stat_date', 'media', 'item_no'],
    dateFrom: 'queryEnd',
    map: {
      media: 'media', item_no: 'item_no', model_no: 'model_no', item_name: 'item_name',
      itemview_count: 'itemview_count', cart_qty_sum: 'cart_qty_sum', conversion_rate: 'conversion_rate',
      ord_count: 'ord_count', ord_qty: 'ord_qty', ord_amount: 'ord_amount',
      realord_count: 'realord_count', realord_qty: 'realord_qty', realord_amount: 'realord_amount',
      real_sale_amount: 'real_sale_amount',
      cancel_takeback_qty: 'cancel_takeback_qty', cancel_takeback_amount: 'cancel_takeback_amount',
    },
  },
```

- [ ] **Step 5: Edge Function 재배포**

```bash
cd spao-dashboard-v3
npx supabase functions deploy need-ingest
```
Expected: `Deployed Function need-ingest` 메시지.

- [ ] **Step 6: 실제 itemAggrList 원본 JSON 1건으로 필드명 검증(수집기 운영자에게 요청)**

수집기가 만드는 `spao-bi-collection-itemAggrList-*.json` 파일 1개를 받아서, `mergedRows[0]`에 위 9개 필드명이 실제로 존재하는지 확인한다. 다르면 Step 4의 `map` 좌변(원본 필드명)만 실제 이름으로 수정 — 테이블 구조·집계 함수(Task 3)는 그대로 재사용 가능.

- [ ] **Step 7: 커밋**

```bash
git add spao-dashboard-v3/supabase/kids_track2_step2_daily_sales_columns.sql spao-dashboard-v3/supabase/functions/need-ingest/index.ts
git commit -m "feat: itemAggrList 매출 필드 보강(daily_sales 컬럼 + need-ingest 매핑)"
```

---

### Task 3: 자사몰 → `kids_channel_daily` 집계 함수 + 주기 실행

**Files:**
- Create: `spao-dashboard-v3/supabase/kids_track2_step3_sales_agg_function.sql`

- [ ] **Step 1: 집계 함수 SQL 작성**

스타일코드 8번째 문자(`model_no`의 8번째 문자, 1-indexed `substr(x, 8, 1)`)가 `K`인 행만 걸러 일자별로 합산한다.

```sql
-- ════════════════════════════════════════════════════════════════════════
-- 자사몰(daily_sales) → kids_channel_daily 집계
-- ────────────────────────────────────────────────────────────────────────
-- model_no(스타일코드) 8번째 문자(성별코드)가 'K'인 행만 걸러 일자별 합산.
-- since_date 이후(기본: 최근 3일 — "당일" 정정 반영용)만 재계산해 가볍게 유지.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.refresh_kids_channel_daily_from_sales(since_date date default null)
returns void
language plpgsql
as $$
begin
  insert into public.kids_channel_daily
    (stat_date, channel, order_cnt, order_amt, real_order_cnt, real_amt, cancel_amt, _source)
  select
    stat_date,
    '자사몰' as channel,
    coalesce(sum(ord_count), 0),
    coalesce(sum(ord_amount), 0),
    coalesce(sum(realord_count), 0),
    coalesce(sum(realord_amount), 0),
    coalesce(sum(cancel_takeback_amount), 0),
    'sales_daily_agg'
  from public.daily_sales
  where model_no is not null
    and upper(substr(model_no, 8, 1)) = 'K'
    and stat_date >= coalesce(since_date, current_date - interval '3 day')::date
  group by stat_date
  on conflict (stat_date, channel) do update set
    order_cnt      = excluded.order_cnt,
    order_amt      = excluded.order_amt,
    real_order_cnt = excluded.real_order_cnt,
    real_amt       = excluded.real_amt,
    cancel_amt     = excluded.cancel_amt,
    _source        = excluded._source,
    _ingested_at   = now();
end;
$$;

-- pg_cron 30분마다 실행 (Supabase 프로젝트에 pg_cron 확장이 필요 — 아래 Step 3 참고)
select cron.schedule(
  'kids-channel-daily-from-sales',
  '*/30 * * * *',
  $$select public.refresh_kids_channel_daily_from_sales();$$
);
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.

- [ ] **Step 3: pg_cron 확장이 없다는 오류가 나면**

Supabase 대시보드 > Database > Extensions 에서 `pg_cron` 을 검색해 Enable 한 뒤 Step 2를 다시 실행한다.

- [ ] **Step 4: 함수 수동 실행으로 동작 확인 (daily_sales에 데이터가 있을 때)**

```sql
select public.refresh_kids_channel_daily_from_sales();
select * from public.kids_channel_daily where channel = '자사몰' order by stat_date desc limit 5;
```
Expected: `daily_sales`에 `model_no` 8번째 문자가 `K`인 행이 있다면 그 날짜들이 `kids_channel_daily`에 `자사몰` 채널로 나타남. `daily_sales`가 아직 비어 있다면(자동 수집이 실제로 시작 전이면) 0행이 정상 — Task 2 Step 6에서 실 데이터가 흐르기 시작하면 재확인.

- [ ] **Step 5: cron 등록 확인**

```sql
select jobname, schedule, active from cron.job where jobname = 'kids-channel-daily-from-sales';
```
Expected: 1행, `active = true`.

- [ ] **Step 6: 커밋**

```bash
git add spao-dashboard-v3/supabase/kids_track2_step3_sales_agg_function.sql
git commit -m "feat: 자사몰 daily_sales -> kids_channel_daily 집계 함수 + pg_cron 스케줄"
```

---

### Task 4: `spao-kids-dashboard` 앱 씨앗 스캐폴드

**Files:**
- Create: `spao-kids-dashboard/package.json`
- Create: `spao-kids-dashboard/vitest.config.js`
- Create: `spao-kids-dashboard/.env.example`
- Create: `spao-kids-dashboard/.gitignore`
- Create: `spao-kids-dashboard/src/lib/supabase.js`

**참고**: 이번 계획은 데이터 배관(순수 JS 유틸 + Supabase)만 다룬다. React/Vite 빌드 설정은 UI 계획(후속)에서 추가한다. 지금은 Vitest만으로 유닛 테스트가 돌아가면 충분하다(YAGNI).

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "spao-kids-dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.108.1"
  },
  "devDependencies": {
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: `vitest.config.js` 작성**

```js
import { defineConfig } from 'vitest/config'

// 테스트 러너는 순수 유틸 함수에만 적용한다(노드 환경, jsdom 불필요).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/**/*.test.js'],
  },
})
```

- [ ] **Step 3: `.env.example` 작성**

```
# ─── 키즈 트랙2 환경변수 ───────────────────────────────────────
# 이 파일을 복사해서 .env.local 을 만들고 값을 채우세요.
# spao-dashboard-v3 와 같은 Supabase 프로젝트를 씁니다(브랜드별 격리 아님, 사내 공유).

VITE_SUPABASE_URL=https://wtflegxxhmzcofojepuf.supabase.co
VITE_SUPABASE_ANON_KEY=여기에_anon_public_키_붙여넣기
```

- [ ] **Step 4: `.gitignore` 작성**

```
node_modules
dist
*.local
.env.local
```

- [ ] **Step 5: `src/lib/supabase.js` 작성**

`spao-dashboard-v3/src/lib/supabase.js`와 동일한 패턴(환경변수 없으면 null로 폴백).

```js
import { createClient } from '@supabase/supabase-js'

const url     = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export const cloudEnabled = !!supabase
```

- [ ] **Step 6: 의존성 설치**

```bash
cd spao-kids-dashboard
npm install
```
Expected: `node_modules` 생성, 에러 없이 종료.

- [ ] **Step 7: 커밋**

```bash
git add spao-kids-dashboard/package.json spao-kids-dashboard/vitest.config.js spao-kids-dashboard/.env.example spao-kids-dashboard/.gitignore spao-kids-dashboard/src/lib/supabase.js
git commit -m "feat: spao-kids-dashboard 앱 씨앗 스캐폴드"
```

---

### Task 5: `styleCodeParser.js` 이식

**Files:**
- Create: `spao-kids-dashboard/src/utils/styleCodeParser.js`
- Test: `spao-kids-dashboard/src/utils/styleCodeParser.test.js`

**참고**: `spao-dashboard-v3/src/utils/styleCodeParser.js`를 그대로 복사한다(두 앱은 별도 배포이며 기존 저장소도 v1/v2/v3를 독립 폴더로 유지하는 관행을 따름 — 모노레포/공유 패키지 신설은 이번 스코프 아님). 개발 콘솔 자가진단 블록(`import.meta.env?.DEV`)은 이 앱엔 아직 dev 서버가 없으므로 제외한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/styleCodeParser.test.js
import { describe, it, expect } from 'vitest'
import { parseStyleCode } from './styleCodeParser'

describe('parseStyleCode', () => {
  it('8번째 문자(성별코드)가 K이면 키즈로 분류한다', () => {
    const parsed = parseStyleCode('SPPPF4VKU2')
    expect(parsed.genderCode).toBe('K')
    expect(parsed.gender).toBe('키즈')
  })

  it('8자 미만이면 안전한 기본값을 반환한다', () => {
    const parsed = parseStyleCode('SP')
    expect(parsed.gender).toBe('기타')
    expect(parsed.genderCode).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd spao-kids-dashboard
npx vitest run src/utils/styleCodeParser.test.js
```
Expected: FAIL — `Cannot find module './styleCodeParser'`.

- [ ] **Step 3: `styleCodeParser.js` 작성 (spao-dashboard-v3에서 이식, dev 콘솔 블록 제외)**

```js
// ─── 교체 가능한 품목코드 테이블 ───────────────────────────────────────────────
export const ITEM_CODE_TABLE = {
  RL: '콜라보 반팔티셔츠', RW: '반팔티', RS: '스트라이프티',
  RN: '나시/민소매', RP: '프린트티', LW: '긴팔티',
  LS: '긴팔 스트라이프티', HW: '헨리넥티', BW: '블라우스',
  BN: '블라우스/나시', MR: '라운드넥 반팔티',
  TJ: '데님 팬츠', TC: '코튼 팬츠', TH: '쇼츠',
  TN: '데님 쇼츠', TA: '슬랙스', TM: '스웨트팬츠', TR: '언더웨어/드로즈',
  JJ: '윈드브레이커', JK: '재킷', JE: '데님 재킷', MZ: '후드 집업',
  WH: '스커트', OW: '원피스', OJ: '원피스',
  PP: '파자마', LO: '홈웨어', WR: '브라/이너', WP: '언더웨어',
  CK: '카디건', KW: '니트',
  YW: '셔츠', YS: '스트라이프 셔츠', YC: '체크 셔츠',
  YJ: '데님 셔츠', DR: '드레스 셔츠',
  SM: '상하세트', AR: '래쉬가드',
  AK: '가방', AY: '삭스', AB: '벨트', AW: '스카프',
  AC: '모자', GM: '스포츠 하의', GG: '스포츠 상의',
}

// ─── 성별코드 테이블 ────────────────────────────────────────────────────────────
export const GENDER_CODE_TABLE = {
  G: '여성', W: '여성', M: '남성', C: '공용', K: '키즈', U: '콜라보',
}

// ─── 스타일코드 파싱 ─────────────────────────────────────────────────────────────
// 예시: SPRWG25G01
//  [0-1] 브랜드   SP
//  [2-3] 품목코드  RW
//  [4]   년도코드  G(신상) F(이월) 기타(기타)
//  [7]   성별코드  G
export function parseStyleCode(code) {
  const c = String(code || '')
  if (c.length < 8) {
    return { brand: 'SPAO', itemCode: '', itemName: '기타', yearCode: '', isNew: false, genderCode: '', gender: '기타' }
  }
  const brand    = c.slice(0, 2) === 'SP' ? 'SPAO' : c.slice(0, 2)
  const itemCode = c.slice(2, 4).toUpperCase()
  const yearCode = c[4].toUpperCase()
  const isNew    = yearCode === 'G'
  const genderCode = c[7].toUpperCase()
  return {
    brand,
    itemCode,
    itemName: ITEM_CODE_TABLE[itemCode] || '기타',
    yearCode,
    isNew,
    genderCode,
    gender: GENDER_CODE_TABLE[genderCode] || '기타',
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/styleCodeParser.test.js
```
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/styleCodeParser.js spao-kids-dashboard/src/utils/styleCodeParser.test.js
git commit -m "feat: styleCodeParser 이식(spao-dashboard-v3에서)"
```

---

### Task 6: 이랜드몰 주문상세 엑셀 파서

**Files:**
- Create: `spao-kids-dashboard/src/utils/elandParser.js`
- Test: `spao-kids-dashboard/src/utils/elandParser.test.js`

**실제 컬럼(2026-07-10 확보한 실제 워크북 `이랜드몰 당일` 시트에서 검증)**: `NO, 전시몰, 주문번호, 배송유형, 상품번호, 상품명, 단품명, 주문상태, 지연종류, 상품권주문취소접수여부, 상품순번, 주문자, 주문유형, 배송정보, 외부몰명, 외부몰주문번호, 품명 및 모델명, ERP단품코드, 변경ERP단품코드, 판매금액, 주문수량, 취소수량, 반품수량, 판매단가, 주문일시, 업체, 하위업체, 송장번호, 로그인ID, 주문매체, ...`. 필요한 건 상품명(스타일코드 추출용)·주문상태·판매금액·주문수량·주문일시.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/elandParser.test.js
import { describe, it, expect } from 'vitest'
import { parseElandOrders } from './elandParser'

// 실제 '이랜드몰 당일'/'이랜드몰 전년' 시트에서 관찰한 실제 헤더·값 그대로 사용.
const HEADER = [
  'NO', '전시몰', '주문번호', '배송유형', '상품번호', '상품명', '단품명', '주문상태',
  '지연종류', '상품권주문취소접수여부', '상품순번', '주문자', '주문유형', '배송정보',
  '외부몰명', '외부몰주문번호', '품명 및 모델명', 'ERP단품코드', '변경ERP단품코드',
  '판매금액', '주문수량', '취소수량', '반품수량', '판매단가', '주문일시',
]

describe('parseElandOrders', () => {
  it('주문 행에서 날짜·스타일코드·금액·상태를 추출한다', () => {
    const rows = [
      HEADER,
      [
        1, '이랜드몰', '202512154294487', '일반', '2509109426',
        '[키즈] (망그러진곰) 수면 파자마_SPPPF4VKU2', '(26)Light Pink/150', '결제완료',
        '', 'N', 1, '민*은', '일반', '부산 연제구 ***',
        '', '', 'SPPPF4VKU2', 'SPPPF4VKU226150', '',
        39900, 1, 0, 0, 39900, '2025-12-15 17:22:23',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      date: '2025-12-15',
      styleCode: 'SPPPF4VKU2',
      status: '결제완료',
      qty: 1,
      amt: 39900,
    })
  })

  it('취소완료 행도 그대로 반환한다(집계 단계에서 필터링)', () => {
    const rows = [
      HEADER,
      [
        1, 'KIDIKIDI', '202412166811283', '일반', '2407359384',
        '[키즈] (산리오캐릭터즈) 긴팔 파자마(LIGHT BLUE)_SPPPE49KU1', '(51)Light Blue/120', '취소완료',
        '', 'N', 4, '김*아', '일반', '',
        '', '', 'SPPPE49KU1', '', '',
        29900, 1, 1, 0, 29900, '2024-12-16 23:10:00',
      ],
    ]
    const items = parseElandOrders(rows)
    expect(items[0].status).toBe('취소완료')
  })

  it('행/헤더가 없으면 빈 배열을 반환한다', () => {
    expect(parseElandOrders([])).toEqual([])
    expect(parseElandOrders(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/elandParser.test.js
```
Expected: FAIL — `Cannot find module './elandParser'`.

- [ ] **Step 3: `elandParser.js` 작성**

```js
function toStr(v) { return v == null ? '' : String(v) }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// 상품명 끝의 '_스타일코드' 추출 (기존 restock 파서와 동일한 규칙)
function extractStyleCode(name) {
  const m = toStr(name).match(/_([A-Za-z0-9]+)\s*$/)
  return m ? m[1] : ''
}

// '2025-12-15 17:22:23' → '2025-12-15'
function extractDate(dt) {
  const m = toStr(dt).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

// 이랜드몰(통합몰) 주문상세 엑셀 rows(헤더 포함 2차원 배열) → 정규화된 주문 아이템 배열.
// "판매금액"은 라인 합계(단가×수량)라고 가정 — 수량>1인 실제 행으로 재검증 필요(계획 문서 참고).
export function parseElandOrders(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0].map(toStr)
  const idx = {
    name:      headers.findIndex(h => h === '상품명'),
    status:    headers.findIndex(h => h.includes('주문상태')),
    amt:       headers.findIndex(h => h.includes('판매금액')),
    qty:       headers.findIndex(h => h.includes('주문수량')),
    cancelQty: headers.findIndex(h => h.includes('취소수량')),
    returnQty: headers.findIndex(h => h.includes('반품수량')),
    orderedAt: headers.findIndex(h => h.includes('주문일시')),
  }

  const items = []
  for (const row of rows.slice(1)) {
    if (!row || row.length === 0) continue
    const date = extractDate(row[idx.orderedAt])
    if (!date) continue
    const name = toStr(row[idx.name])
    items.push({
      date,
      styleCode: extractStyleCode(name),
      name,
      status:    toStr(row[idx.status]),
      qty:       toNum(row[idx.qty]),
      cancelQty: toNum(row[idx.cancelQty]),
      returnQty: toNum(row[idx.returnQty]),
      amt:       toNum(row[idx.amt]),
    })
  }
  return items
}

export const ELAND_CANCELED_STATUS = '취소완료'
export function isElandCanceled(item) {
  return item.status === ELAND_CANCELED_STATUS
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/elandParser.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/elandParser.js spao-kids-dashboard/src/utils/elandParser.test.js
git commit -m "feat: 이랜드몰 주문상세 엑셀 파서 추가"
```

---

### Task 7: 채널별 일자 집계 유틸 (`aggregateChannelDaily`)

**Files:**
- Create: `spao-kids-dashboard/src/utils/aggregateChannelDaily.js`
- Test: `spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js`

**설계**: 이랜드몰뿐 아니라 향후 네이버 어댑터도 재사용할 수 있게, 채널 고유 로직(취소 판정)은 `isCanceled` 콜백으로 주입받는 채널-불특정 유틸로 만든다. 스타일코드 성별코드 필터도 여기서 한 번 더 건다(원본이 이미 키즈만 걸러져 있어도 안전망으로 유지 — Track1의 `filterPayloadByGender`와 같은 원칙).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js
import { describe, it, expect } from 'vitest'
import { aggregateChannelDaily } from './aggregateChannelDaily'

const isCanceled = (item) => item.status === '취소완료'

describe('aggregateChannelDaily', () => {
  it('같은 날짜의 항목을 합산하고 취소 건은 cancelAmt로 분리한다', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 },
      { date: '2026-07-01', styleCode: 'SPPPE49KU1', status: '취소완료', qty: 1, amt: 29900 },
      { date: '2026-07-02', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 2, amt: 79800 },
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
      { date: '2026-07-02', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 79800, realOrderCnt: 2, realAmt: 79800, cancelAmt: 0 },
    ])
  })

  it('성별코드가 다른 상품은 걸러낸다(안전망)', () => {
    const items = [
      { date: '2026-07-01', styleCode: 'SPPPF4VKU2', status: '결제완료', qty: 1, amt: 39900 }, // 키즈(K)
      { date: '2026-07-01', styleCode: 'SPRWG25G01', status: '결제완료', qty: 1, amt: 29900 }, // 여성(G)
    ]
    const out = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled })
    expect(out).toEqual([
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 39900, realOrderCnt: 1, realAmt: 39900, cancelAmt: 0 },
    ])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(aggregateChannelDaily([], { channel: '이랜드몰', isCanceled })).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/aggregateChannelDaily.test.js
```
Expected: FAIL — `Cannot find module './aggregateChannelDaily'`.

- [ ] **Step 3: `aggregateChannelDaily.js` 작성**

```js
import { parseStyleCode } from './styleCodeParser'

// items: { date, styleCode, status, qty, amt, ... } 배열(채널 무관 공통 모양)
// isCanceled(item): 그 채널에서 "취소"로 볼 상태 판정 콜백(채널마다 상태값이 다름)
// genderCode: 상품 필터(기본 'K'=키즈) — 원본이 이미 필터돼 있어도 안전망으로 항상 적용
export function aggregateChannelDaily(items, { channel, isCanceled, genderCode = 'K' }) {
  const byDate = new Map()
  for (const it of items) {
    if (genderCode && parseStyleCode(it.styleCode).genderCode !== genderCode) continue
    if (!byDate.has(it.date)) {
      byDate.set(it.date, { orderCnt: 0, orderAmt: 0, realOrderCnt: 0, realAmt: 0, cancelAmt: 0 })
    }
    const acc = byDate.get(it.date)
    const canceled = isCanceled(it)
    acc.orderCnt += it.qty
    acc.orderAmt += it.amt
    if (canceled) {
      acc.cancelAmt += it.amt
    } else {
      acc.realOrderCnt += it.qty
      acc.realAmt += it.amt
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => ({ date, channel, discountAmt: null, ...acc }))
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/aggregateChannelDaily.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/aggregateChannelDaily.js spao-kids-dashboard/src/utils/aggregateChannelDaily.test.js
git commit -m "feat: 채널 무관 일자 집계 유틸 aggregateChannelDaily 추가"
```

---

### Task 8: `kids_channel_daily` 업로드 유틸

**Files:**
- Create: `spao-kids-dashboard/src/utils/uploadKidsChannelDaily.js`
- Test: `spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js`

**설계**: Supabase 클라이언트를 파라미터로 주입받아, 테스트에서는 진짜 네트워크 호출 없이 모의(mock) 클라이언트로 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js
import { describe, it, expect, vi } from 'vitest'
import { uploadKidsChannelDaily } from './uploadKidsChannelDaily'

function makeMockClient({ error = null, count = 2 } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error, count })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from }, upsert, from }
}

describe('uploadKidsChannelDaily', () => {
  it('집계 행을 kids_channel_daily 스키마로 변환해 upsert한다', async () => {
    const { client, from, upsert } = makeMockClient()
    const rows = [
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 1, realAmt: 39900, cancelAmt: 29900 },
    ]
    const result = await uploadKidsChannelDaily(client, rows)

    expect(from).toHaveBeenCalledWith('kids_channel_daily')
    expect(upsert).toHaveBeenCalledWith(
      [{
        stat_date: '2026-07-01', channel: '이랜드몰',
        order_cnt: 2, order_amt: 69800, real_order_cnt: 1, real_amt: 39900,
        cancel_amt: 29900, discount_amt: null, _source: 'eland_upload',
      }],
      { onConflict: 'stat_date,channel', count: 'exact' },
    )
    expect(result).toEqual({ ok: true, upserted: 2 })
  })

  it('행이 없으면 업서트 없이 성공을 반환한다', async () => {
    const { client, upsert } = makeMockClient()
    const result = await uploadKidsChannelDaily(client, [])
    expect(upsert).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, upserted: 0 })
  })

  it('Supabase 에러를 그대로 전달한다', async () => {
    const { client } = makeMockClient({ error: { message: 'boom' } })
    const result = await uploadKidsChannelDaily(client, [
      { date: '2026-07-01', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 1, realOrderCnt: 1, realAmt: 1, cancelAmt: 0 },
    ])
    expect(result).toEqual({ ok: false, error: 'boom' })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/utils/uploadKidsChannelDaily.test.js
```
Expected: FAIL — `Cannot find module './uploadKidsChannelDaily'`.

- [ ] **Step 3: `uploadKidsChannelDaily.js` 작성**

```js
// rows: aggregateChannelDaily() 결과 배열
// supabaseClient: @supabase/supabase-js 클라이언트(테스트에서는 모의 객체 주입)
export async function uploadKidsChannelDaily(supabaseClient, rows) {
  if (!rows || rows.length === 0) return { ok: true, upserted: 0 }

  const source = { '자사몰': 'sales_daily_agg', '이랜드몰': 'eland_upload', '네이버': 'naver_api' }
  const payload = rows.map(r => ({
    stat_date: r.date,
    channel: r.channel,
    order_cnt: r.orderCnt,
    order_amt: r.orderAmt,
    real_order_cnt: r.realOrderCnt,
    real_amt: r.realAmt,
    cancel_amt: r.cancelAmt,
    discount_amt: r.discountAmt,
    _source: source[r.channel] ?? null,
  }))

  const { error, count } = await supabaseClient
    .from('kids_channel_daily')
    .upsert(payload, { onConflict: 'stat_date,channel', count: 'exact' })

  if (error) return { ok: false, error: error.message }
  return { ok: true, upserted: count ?? payload.length }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
npx vitest run src/utils/uploadKidsChannelDaily.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add spao-kids-dashboard/src/utils/uploadKidsChannelDaily.js spao-kids-dashboard/src/utils/uploadKidsChannelDaily.test.js
git commit -m "feat: kids_channel_daily 업로드 유틸 추가(모의 클라이언트로 테스트)"
```

---

### Task 9: 전체 파이프라인 통합 테스트 (실제 워크북 표본 기반)

**Files:**
- Test: `spao-kids-dashboard/src/utils/elandPipeline.integration.test.js`

**목적**: 파싱→집계→업로드payload 변환까지 하나의 흐름으로 묶어, 실제 이랜드몰 시트에서 관찰한 표본(성공/취소 섞인 여러 날짜)으로 최종 산출물이 옳은지 검증한다. 이 테스트가 통과하면 Task 4~8이 서로 맞물려 동작함이 보증된다.

- [ ] **Step 1: 통합 테스트 작성**

```js
// spao-kids-dashboard/src/utils/elandPipeline.integration.test.js
import { describe, it, expect, vi } from 'vitest'
import { parseElandOrders, isElandCanceled } from './elandParser'
import { aggregateChannelDaily } from './aggregateChannelDaily'
import { uploadKidsChannelDaily } from './uploadKidsChannelDaily'

const HEADER = [
  'NO', '전시몰', '주문번호', '배송유형', '상품번호', '상품명', '단품명', '주문상태',
  '지연종류', '상품권주문취소접수여부', '상품순번', '주문자', '주문유형', '배송정보',
  '외부몰명', '외부몰주문번호', '품명 및 모델명', 'ERP단품코드', '변경ERP단품코드',
  '판매금액', '주문수량', '취소수량', '반품수량', '판매단가', '주문일시',
]

// 실제 '이랜드몰 당일'/'이랜드몰 전년' 시트에서 관찰한 표본 3건(성공 2건 + 취소 1건, 날짜 2개)
const ROWS = [
  HEADER,
  [1, '이랜드몰', '202512154294487', '일반', '2509109426', '[키즈] (망그러진곰) 수면 파자마_SPPPF4VKU2', '(26)Light Pink/150', '결제완료', '', 'N', 1, '민*은', '일반', '', '', '', 'SPPPF4VKU2', 'SPPPF4VKU226150', '', 39900, 1, 0, 0, 39900, '2025-12-15 17:22:23'],
  [3, '이랜드몰', '202512154294476', '일반', '2511163727', '[키즈] 오로라 퍼플리스 집업_SPFZF4TKU4', '(AN)Aurora Pink/130', '상품준비중', '', 'N', 1, '김*윤', '일반', '', '', '', 'SPFZF4TKU4', 'SPFZF4TKU4AN130', '', 29900, 1, 0, 0, 29900, '2025-12-15 17:14:03'],
  [1, 'KIDIKIDI', '202412166811283', '일반', '2407359384', '[키즈] (산리오캐릭터즈) 긴팔 파자마(LIGHT BLUE)_SPPPE49KU1', '(51)Light Blue/120', '취소완료', '', 'N', 4, '김*아', '일반', '', '', '', 'SPPPE49KU1', '', '', 29900, 1, 1, 0, 29900, '2024-12-16 23:10:00'],
]

describe('이랜드몰 파이프라인 통합', () => {
  it('파싱 -> 집계 -> 업로드 payload까지 일관되게 이어진다', async () => {
    const items = parseElandOrders(ROWS)
    expect(items).toHaveLength(3)

    const daily = aggregateChannelDaily(items, { channel: '이랜드몰', isCanceled: isElandCanceled })
    expect(daily).toEqual([
      { date: '2024-12-16', channel: '이랜드몰', discountAmt: null, orderCnt: 1, orderAmt: 29900, realOrderCnt: 0, realAmt: 0, cancelAmt: 29900 },
      { date: '2025-12-15', channel: '이랜드몰', discountAmt: null, orderCnt: 2, orderAmt: 69800, realOrderCnt: 2, realAmt: 69800, cancelAmt: 0 },
    ])

    const upsert = vi.fn().mockResolvedValue({ error: null, count: daily.length })
    const client = { from: vi.fn().mockReturnValue({ upsert }) }
    const result = await uploadKidsChannelDaily(client, daily)

    expect(result).toEqual({ ok: true, upserted: 2 })
    expect(upsert.mock.calls[0][0]).toEqual([
      { stat_date: '2024-12-16', channel: '이랜드몰', order_cnt: 1, order_amt: 29900, real_order_cnt: 0, real_amt: 0, cancel_amt: 29900, discount_amt: null, _source: 'eland_upload' },
      { stat_date: '2025-12-15', channel: '이랜드몰', order_cnt: 2, order_amt: 69800, real_order_cnt: 2, real_amt: 69800, cancel_amt: 0, discount_amt: null, _source: 'eland_upload' },
    ])
  })
})
```

- [ ] **Step 2: 전체 테스트 스위트 실행**

```bash
cd spao-kids-dashboard
npm test
```
Expected: 모든 테스트 파일 PASS (styleCodeParser, elandParser, aggregateChannelDaily, uploadKidsChannelDaily, elandPipeline.integration — 총 5개 파일).

- [ ] **Step 3: 커밋**

```bash
git add spao-kids-dashboard/src/utils/elandPipeline.integration.test.js
git commit -m "test: 이랜드몰 파싱->집계->업로드 통합 테스트 추가"
```

---

## 완료 후 상태 점검

- `kids_channel_daily` 테이블이 존재하고 `자사몰`/`이랜드몰` 채널로 upsert 가능한 상태.
- 자사몰: `daily_sales`에 실 데이터가 흐르기 시작하면(Task 2 Step 6 검증 후) pg_cron이 30분마다 자동으로 채움 — 추가 작업 불필요.
- 이랜드몰: 아직 "사람이 엑셀을 업로드하면 파싱→집계→업로드"까지의 순수 로직만 완성됨. 실제 업로드 버튼(UI)은 없음 — 후속 UI 계획에서 이 유틸들을 그대로 가져다 쓴다.
- 네이버: 이 계획에 포함되지 않음. 키즈 전용 셀러 계정의 API 자격증명을 확보하면 별도 계획으로 진행한다.

## 다음 계획(별도로 작성)

1. **네이버 커머스 API 연동** — OAuth2(bcrypt 서명) 토큰 발급 → `last-changed-statuses`로 변경 주문 조회 → `product-orders/query`로 상세 조회 → `aggregateChannelDaily`(이번 계획에서 이미 채널-무관하게 만듦) 재사용 → `uploadKidsChannelDaily` 재사용. 실 자격증명 확보 후 착수.
2. **화면(UI)** — `spao-kids-dashboard`에 Vite+React 추가, 당일 스코어보드/당월 누적/일별 추이 화면을 `kids_channel_daily` 조회로 구현. 이랜드몰 업로드 버튼도 이때 붙인다.
