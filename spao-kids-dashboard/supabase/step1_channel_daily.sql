-- ════════════════════════════════════════════════════════════════════════
-- 키즈 트랙2 — 일자×채널 공통 실적 테이블 (신규 키즈 전용 Supabase 프로젝트)
-- ────────────────────────────────────────────────────────────────────────
-- 자사몰·이랜드몰·네이버 3채널의 "당일/당월" 실적을 하나의 스키마로 통합.
-- 지금은 수기 업로드(xlsb 파싱)로 채우고, 채널별 자동화가 준비되면 같은
-- 테이블에 같은 방식으로 upsert하는 어댑터로 하나씩 교체한다(_source로 구분).
-- 키:   (stat_date, channel) upsert — 같은 날 재적재해도 멱등.
-- 권한: authenticated 읽기·쓰기(팀 공유 도구 — 성인 대시보드처럼 로그인 필요).
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
  _source          text,  -- 'gonghom_upload' | 'eland_upload' | 'naver_upload' | (후속) 'naver_api' 등
  _ingested_at     timestamptz not null default now(),
  primary key (stat_date, channel)
);

create index if not exists idx_kids_channel_daily_date on public.kids_channel_daily (stat_date);

alter table public.kids_channel_daily enable row level security;
drop policy if exists "auth rw kids_channel_daily" on public.kids_channel_daily;
create policy "auth rw kids_channel_daily" on public.kids_channel_daily
  for all to authenticated using (true) with check (true);
