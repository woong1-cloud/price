-- ════════════════════════════════════════════════════════════════════════
-- 일자별(실제 컬럼) 검증/스테이징 테이블 — N.E.E.D 자동 수집 JSON 적재용
-- ────────────────────────────────────────────────────────────────────────
-- 목적: weekly_snapshots(gzip jsonb)는 화면 원천으로 그대로 두고,
--       "일자별 원본을 실제 컬럼으로" 별도 적재해 SQL로 직접 검증·조회할 수 있게 한다.
-- 원칙: 컬럼명은 NEED 원본 필드명을 최대한 그대로 사용(변환 최소화 = 매핑 오류 최소화).
--       내부 표준 스키마(sales/coupon/...)로의 변환은 이 테이블을 읽는 별도 뷰/함수에서 수행.
-- 키:   각 테이블은 (자연키 + stat_date) 유니크 → 같은 날 재수집 시 upsert(멱등, 재시도 안전).
-- 권한: RLS 활성화. authenticated 는 읽기(SELECT)만. 쓰기는 service_role(Edge Function)만
--       — service_role 은 RLS 를 우회하므로 별도 insert/update 정책을 만들지 않는다.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 공통: 감사 컬럼 자동 세팅 ─────────────────────────────────────────────
-- 모든 테이블에 stat_date(집계 기준일) + _collected_at(NEED 수집시각) + _ingested_at(우리 적재시각) 포함.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) daily_sales_by_date  ← endpointId: salesDaily (기간별 매출분석)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_sales_by_date (
  stat_date               date not null,
  media                   text not null,
  ord_count               int,
  ord_qty                 int,
  ord_amount              bigint,
  ordpsn_count            int,
  realord_count           int,
  realord_qty             int,
  realord_amount          bigint,
  real_sale_amount        bigint,
  cancel_takeback_qty     int,
  cancel_takeback_amount  bigint,
  benefit_dc_amount       bigint,
  all_benefit_amount      bigint,
  benefit_saving_amount   bigint,
  shipcost_amount         bigint,
  _collected_at           timestamptz,
  _ingested_at            timestamptz not null default now(),
  primary key (stat_date, media)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) daily_sales  ← endpointId: itemAggrList (상품실적, 상품×매체)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_sales (
  stat_date         date not null,
  media             text not null,
  item_no           text not null,
  model_no          text,          -- 스타일코드
  item_name         text,
  itemview_count    int,
  cart_qty_sum      int,
  conversion_rate   numeric,
  _collected_at     timestamptz,
  _ingested_at      timestamptz not null default now(),
  primary key (stat_date, media, item_no)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) daily_cart  ← endpointId: cartItemList (장바구니 분석, 단품 단위)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_cart (
  stat_date            date not null,
  item_no              text not null,
  cart_uitem_no        text not null,   -- 단품번호
  uitem_name           text,            -- 컬러/사이즈
  item_name            text,
  model_no             text,
  cart_cnt             int,
  cart_qty             int,
  member_cart_cnt      int,
  member_cart_qty      int,
  nonmember_cart_cnt   int,
  nonmember_cart_qty   int,
  completed_ord_qty    int,
  giveup_cnt           int,
  giveup_rate          numeric,
  sellprice            bigint,
  occur_dt             text,           -- 원본 기간 문자열("YYYY-MM-DD ~ YYYY-MM-DD") 참고용
  _collected_at        timestamptz,
  _ingested_at          timestamptz not null default now(),
  primary key (stat_date, item_no, cart_uitem_no)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) daily_wishlist  ← endpointId: wishItemList (관심상품 분석)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_wishlist (
  stat_date     date not null,
  item_no       text not null,
  item_name     text,
  model_no      text,
  wish_cnt      int,
  sellprice     bigint,
  _collected_at timestamptz,
  _ingested_at  timestamptz not null default now(),
  primary key (stat_date, item_no)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) daily_customer  ← endpointId: mbrSales (회원 매출분석, 성별×연령)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_customer (
  stat_date            date not null,
  gender_name          text not null,
  age_scope_name       text not null,
  mbr_count            int,
  new_mbr_count        int,
  first_ordpsn_count   int,
  ordpsn_count         int,
  ord_count            int,
  ord_amount           bigint,
  realord_count        int,
  realord_amount       bigint,
  visitors_sum         int,
  click_sum            int,
  ctr                  numeric,
  conversion_rate      numeric,
  _collected_at        timestamptz,
  _ingested_at         timestamptz not null default now(),
  primary key (stat_date, gender_name, age_scope_name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6) daily_visit_hourly  ← endpointId: visitSnapshot (방문지표, 시간대별)
--    ⚠ 원본 파일 1개에 "당일 24행" + "전일 비교용 24행(_p 접미사 필드)"이 섞여 있음.
--       적재 시 당일 행만 사용(_p 접미사 없는 행). 전일 비교는 daily_visit_hourly 를
--       stat_date 기준으로 셀프 조인하면 되므로 별도 저장 불필요.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_visit_hourly (
  stat_date         date not null,
  hour              smallint not null,   -- 0~23
  uv                int,
  visitors          int,
  lv                int,                 -- 신규방문(신규 랜딩뷰)
  pv                int,
  pv_per_uv         numeric,
  ord_cnt           int,
  conversion_rate   numeric,
  _collected_at     timestamptz,
  _ingested_at      timestamptz not null default now(),
  primary key (stat_date, hour)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 7) daily_store_hourly  ← endpointId: shopContributeHourly (매장 종합실적, 시간대×매체×매장)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_store_hourly (
  stat_date          date not null,
  hour               smallint not null,
  media              text not null,
  page_shop_ccode_name text not null,   -- 매장그룹
  page_name          text not null,     -- 매장명
  uv                 int,
  visitors           int,
  pv                 int,
  ord_count          int,
  ord_amount         bigint,
  realord_count      int,
  realord_amount     bigint,
  bounce_rate        numeric,
  all_benefit_amount bigint,
  benefit_dc_amount  bigint,
  _collected_at      timestamptz,
  _ingested_at       timestamptz not null default now(),
  primary key (stat_date, hour, media, page_shop_ccode_name, page_name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 8) daily_search  ← endpointId: searchKeywordDaily (검색실적)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_search (
  stat_date          date not null,
  url_keyword        text not null,
  search_success_yn  text,
  searchs            int,
  uv                 int,
  clicks             int,
  unique_clicks      int,
  unique_search      int,
  cr                 numeric,
  ord_count          int,
  ord_amount         bigint,
  search_value       numeric,
  item_cnt           int,
  _collected_at      timestamptz,
  _ingested_at       timestamptz not null default now(),
  primary key (stat_date, url_keyword)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 9) daily_coupon  ← endpointId: couponPerf (쿠폰실적, 프로모션×일자)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_coupon (
  stat_date                       date not null,   -- ord_date (행 자체에 존재)
  prom_no                         text not null,
  prom_name                       text,
  prom_kind_group_code_name       text,            -- 프로모션종류그룹
  coupon_dcode_name               text,
  regpsn_id                       text,
  modpsn_id                       text,
  coupon_occur_count              int,
  coupon_use_count                int,
  coupon_realuse_count            int,
  coupon_cancel_count             int,
  coupon_recall_count             int,
  coupon_reduct_count             int,
  ord_amount                      bigint,
  realord_amount                  bigint,
  benefit_amount                  bigint,
  benefit_dc_amount               bigint,
  cart_coupon_dc_amount           bigint,
  md_burden_coupon_dc_amount      bigint,
  mktg_burden_coupon_dc_amount    bigint,
  branch_burden_coupon_dc_amount  bigint,
  vend_burden_coupon_dc_amount    bigint,
  cs_burden_coupon_dc_amount      bigint,
  max_burden_coupon_dc_amount     bigint,
  etc_burden_coupon_dc_amount     bigint,
  shipcost_amount                 bigint,
  shipcost_dc_amount              bigint,
  _collected_at                   timestamptz,
  _ingested_at                    timestamptz not null default now(),
  primary key (stat_date, prom_no)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 10) daily_item_category_rank  ← endpointId: itemCategoryRank (상품지표, 카테고리별 랭킹)
--     ⚠ 상품 하나가 여러 카테고리(대/중/소분류)에 동시 소속되어 행이 중복됨(정상).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_item_category_rank (
  stat_date                        date not null,
  item_no                          text not null,
  model_no                         text,
  item_name                        text,
  large_class_disp_category_no     text not null,
  large_class_disp_category_name   text,
  middle_class_disp_category_no    text,
  middle_class_disp_category_name  text,
  small_class_disp_category_no     text not null,
  small_class_disp_category_name   text,
  itemview_count                   int,
  itemview_rank                    int,
  ord_amount                       bigint,
  ord_amount_rank                  int,
  ord_count                        int,
  ord_count_rank                   int,
  real_sale_amount                 bigint,
  cart_qty                         int,
  cart_qty_rank                    int,
  wish_qty                         int,
  cancel_takeback_amount           bigint,
  _collected_at                    timestamptz,
  _ingested_at                     timestamptz not null default now(),
  primary key (stat_date, item_no, small_class_disp_category_no)
);

-- ── 인덱스 (검증 쿼리 성능) ─────────────────────────────────────────────
create index if not exists idx_daily_sales_by_date_date on public.daily_sales_by_date (stat_date);
create index if not exists idx_daily_sales_date on public.daily_sales (stat_date);
create index if not exists idx_daily_cart_date on public.daily_cart (stat_date);
create index if not exists idx_daily_wishlist_date on public.daily_wishlist (stat_date);
create index if not exists idx_daily_customer_date on public.daily_customer (stat_date);
create index if not exists idx_daily_visit_hourly_date on public.daily_visit_hourly (stat_date);
create index if not exists idx_daily_store_hourly_date on public.daily_store_hourly (stat_date);
create index if not exists idx_daily_search_date on public.daily_search (stat_date);
create index if not exists idx_daily_coupon_date on public.daily_coupon (stat_date);
create index if not exists idx_daily_item_category_rank_date on public.daily_item_category_rank (stat_date);

-- ── RLS: 로그인 사용자는 읽기(검증/조회)만. 쓰기는 service_role(Edge Function)만 ──
do $$
declare t text;
begin
  for t in select unnest(array[
    'daily_sales_by_date','daily_sales','daily_cart','daily_wishlist','daily_customer',
    'daily_visit_hourly','daily_store_hourly','daily_search','daily_coupon','daily_item_category_rank'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth read %1$s" on public.%1$I', t);
    execute format('create policy "auth read %1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 교차검증 예시 쿼리 (참고용 — 그대로 SQL Editor 에서 실행 가능)
-- ════════════════════════════════════════════════════════════════════════

-- 예1) sigma 무결성: 일자별 매출 합계가 음수/이상치인 날 찾기
-- select stat_date, media, realord_amount
-- from public.daily_sales_by_date
-- where realord_amount < 0 or ord_amount < realord_amount;

-- 예2) 쿠폰: 발급수보다 사용수가 큰 이상 행(데이터 오류 감지)
-- select * from public.daily_coupon where coupon_realuse_count > coupon_occur_count;

-- 예3) 특정 주(월~일) 합계를 weekly_snapshots 와 대조할 때 쓸 주간 롤업
-- select date_trunc('week', stat_date)::date as week_start,
--        media, sum(realord_amount) as weekly_real_amt
-- from public.daily_sales_by_date
-- group by 1, 2
-- order by 1 desc, 2;
