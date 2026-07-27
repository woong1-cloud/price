-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK — 익명(anon) 접근 원복 (STEP 2 이전 상태로)
-- ────────────────────────────────────────────────────────────────────────
-- 언제: STEP 2 잠금 후 화면이 안 열리는 등 문제가 생겼을 때 즉시 실행.
-- 효과: anon 읽기/쓰기를 다시 허용해 기존(잠금 전) 동작으로 복구.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

-- weekly_snapshots: anon 복구
drop policy if exists "anon read snapshots"   on public.weekly_snapshots;
drop policy if exists "anon insert snapshots" on public.weekly_snapshots;
drop policy if exists "anon update snapshots" on public.weekly_snapshots;
drop policy if exists "anon delete snapshots" on public.weekly_snapshots;
create policy "anon read snapshots"   on public.weekly_snapshots for select to anon using (true);
create policy "anon insert snapshots" on public.weekly_snapshots for insert to anon with check (true);
create policy "anon update snapshots" on public.weekly_snapshots for update to anon using (true) with check (true);
create policy "anon delete snapshots" on public.weekly_snapshots for delete to anon using (true);

-- dashboard_state: anon 복구
drop policy if exists "anon can read"   on public.dashboard_state;
drop policy if exists "anon can insert" on public.dashboard_state;
drop policy if exists "anon can update" on public.dashboard_state;
create policy "anon can read"   on public.dashboard_state for select to anon using (true);
create policy "anon can insert" on public.dashboard_state for insert to anon with check (true);
create policy "anon can update" on public.dashboard_state for update to anon using (true) with check (true);

-- 인덱스 뷰 원복
alter view public.weekly_snapshots_index set (security_invoker = false);
grant select on public.weekly_snapshots_index to anon;

-- 참고: authenticated 정책(STEP 1)은 남겨도 무방하다(로그인 사용자도 계속 동작).
-- 완전히 원복하려면 아래 두 줄 주석 해제:
-- drop policy if exists "auth all snapshots" on public.weekly_snapshots;
-- drop policy if exists "auth all state" on public.dashboard_state;
