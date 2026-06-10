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
