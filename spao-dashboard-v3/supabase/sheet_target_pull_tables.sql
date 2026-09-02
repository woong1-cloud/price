-- ════════════════════════════════════════════════════════════════════════
-- daily_target / daily_last_year_actual — 목표 대비·전년 비교 스코어보드용
-- ────────────────────────────────────────────────────────────────────────
-- 구글 시트(목표값 탭 / 전년 비교 탭)를 sheet-target-pull Edge Function이
-- 매일 읽어 이 두 테이블에 upsert한다. 이번 기간 "실적"은 이 테이블에
-- 없다 — 기존 N.E.E.D 파이프라인 숫자를 화면에서 그대로 쓴다.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.daily_target (
  stat_date        date primary key,
  revenue_target   numeric not null default 0,
  sessions_target  numeric not null default 0,
  conv_rate_target numeric not null default 0,   -- 퍼센트 단위 숫자 (4 = 4%)
  aov_target       numeric not null default 0,
  _ingested_at     timestamptz not null default now()
);

create table if not exists public.daily_last_year_actual (
  stat_date    date primary key,   -- 작년 실제 달력 날짜 (예: 2025-05-01)
  revenue      numeric not null default 0,
  orders       numeric not null default 0,
  sessions     numeric not null default 0,
  conv_rate    numeric not null default 0,   -- 퍼센트 단위 숫자
  aov          numeric not null default 0,
  _ingested_at timestamptz not null default now()
);

-- ── RLS: 기존 daily_ga4_* 와 동일 패턴 — authenticated 읽기만, 쓰기는 service_role ──
alter table public.daily_target enable row level security;
drop policy if exists "auth read daily_target" on public.daily_target;
create policy "auth read daily_target" on public.daily_target for select to authenticated using (true);

alter table public.daily_last_year_actual enable row level security;
drop policy if exists "auth read daily_last_year_actual" on public.daily_last_year_actual;
create policy "auth read daily_last_year_actual" on public.daily_last_year_actual for select to authenticated using (true);

-- ── 확인 ──
-- select column_name, data_type from information_schema.columns
-- where table_name = 'daily_target' order by ordinal_position;
-- select column_name, data_type from information_schema.columns
-- where table_name = 'daily_last_year_actual' order by ordinal_position;
