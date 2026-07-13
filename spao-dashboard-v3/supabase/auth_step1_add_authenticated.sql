-- ════════════════════════════════════════════════════════════════════════
-- STEP 1 — 로그인 사용자(authenticated) 권한 "추가" (안전·비파괴)
-- ────────────────────────────────────────────────────────────────────────
-- 목적: 로그인하면 요청이 anon 이 아니라 authenticated 권한으로 나간다.
--       먼저 authenticated 정책을 추가해야 로그인 후에도 읽기/쓰기가 된다.
-- 안전: anon 정책은 그대로 둔다 → 기존 동작 안 깨짐. 로그인 코드 배포 전에 먼저 실행 권장.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "auth all snapshots" on public.weekly_snapshots;
create policy "auth all snapshots" on public.weekly_snapshots
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all state" on public.dashboard_state;
create policy "auth all state" on public.dashboard_state
  for all to authenticated using (true) with check (true);

grant select on public.weekly_snapshots_index to authenticated;
