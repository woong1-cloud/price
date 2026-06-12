-- ════════════════════════════════════════════════════════════════════════
-- SPAO 대시보드 V3 — Supabase 스키마
-- 실행 방법: Supabase 대시보드 > SQL Editor > 아래 전체 붙여넣고 RUN
-- ════════════════════════════════════════════════════════════════════════

-- 전체 공유 단일 데이터셋: 항상 id=1 한 행만 사용한다.
create table if not exists public.dashboard_state (
  id          int primary key default 1,
  this_week   jsonb,
  last_week   jsonb,
  updated_at  timestamptz default now(),
  updated_by  text,
  constraint dashboard_state_single_row check (id = 1)
);

-- 기본 행 생성 (없을 때만)
insert into public.dashboard_state (id) values (1)
on conflict (id) do nothing;

-- ── RLS (Row Level Security) ──────────────────────────────────────────────
-- 접속 제어는 프론트엔드의 "공유 비밀번호 게이트"가 담당한다.
-- 이 테이블은 anon(공개) 역할에 읽기/쓰기를 허용한다. (사내 도구 수준 보안)
alter table public.dashboard_state enable row level security;

drop policy if exists "anon can read"   on public.dashboard_state;
drop policy if exists "anon can insert" on public.dashboard_state;
drop policy if exists "anon can update" on public.dashboard_state;

create policy "anon can read"   on public.dashboard_state
  for select to anon using (true);

create policy "anon can insert" on public.dashboard_state
  for insert to anon with check (true);

create policy "anon can update" on public.dashboard_state
  for update to anon using (true) with check (true);

-- ── 실시간(Realtime) ──────────────────────────────────────────────────────
-- 한 명이 업로드하면 다른 사용자 화면에 자동 반영되도록 발행에 테이블 추가.
-- (이미 추가돼 있으면 에러가 날 수 있는데, 그 줄만 건너뛰면 됩니다)
do $$
begin
  alter publication supabase_realtime add table public.dashboard_state;
exception
  when duplicate_object then null;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- 주차별 스냅샷 누적 (weekly_snapshots) — Phase 1
-- 주마다 한 행. week_key(UNIQUE) 기준 upsert 로 같은 주는 덮어쓴다.
-- payload 는 한 주치 week 객체(현재 dashboard_state.this_week 와 동일 형태).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.weekly_snapshots (
  week_key      text primary key,            -- "2026-W23"
  week_label    text not null,               -- "6월 1주"
  week_start    date,                         -- 2026-06-01
  week_end      date,                         -- 2026-06-07
  payload       jsonb not null,               -- 한 주치 week 객체
  files_present text[] not null default '{}', -- ['sales','cart',...]
  uploaded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create index if not exists weekly_snapshots_start_idx
  on public.weekly_snapshots (week_start);

-- ── RLS: dashboard_state 와 동일 수위 (사내 도구 수준) ─────────────────────
alter table public.weekly_snapshots enable row level security;

drop policy if exists "anon read snapshots"   on public.weekly_snapshots;
drop policy if exists "anon insert snapshots" on public.weekly_snapshots;
drop policy if exists "anon update snapshots" on public.weekly_snapshots;
drop policy if exists "anon delete snapshots" on public.weekly_snapshots;

create policy "anon read snapshots"   on public.weekly_snapshots
  for select to anon using (true);

create policy "anon insert snapshots" on public.weekly_snapshots
  for insert to anon with check (true);

create policy "anon update snapshots" on public.weekly_snapshots
  for update to anon using (true) with check (true);

create policy "anon delete snapshots" on public.weekly_snapshots
  for delete to anon using (true);

-- ── 인덱스 전용 뷰 (payload 제외) — lazy loading 용 ────────────────────────
create or replace view public.weekly_snapshots_index as
  select week_key, week_label, week_start, week_end,
         files_present, uploaded_at, updated_at, updated_by
  from public.weekly_snapshots
  order by week_start desc nulls last, week_key desc;

-- ── 실시간: 주 추가/수정 감지 (인덱스 갱신용) ──────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.weekly_snapshots;
exception
  when duplicate_object then null;
end $$;
