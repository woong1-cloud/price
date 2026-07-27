-- ════════════════════════════════════════════════════════════════════════
-- STEP 2 — 익명(anon) 접근 차단 (실제 잠금)
-- ────────────────────────────────────────────────────────────────────────
-- ⚠️ 선행 조건: STEP 1 실행 + 새 로그인 코드 배포 + 실제 로그인으로 화면·업로드 정상 확인!
--    (확인 전에 실행하면 화면이 안 열릴 수 있음 → 문제 시 auth_rollback.sql 실행)
-- 효과: 로그인하지 않은 익명(anon)은 데이터 읽기/쓰기 모두 차단된다.
-- 실행: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN.
-- ════════════════════════════════════════════════════════════════════════

-- weekly_snapshots: anon 정책 제거
drop policy if exists "anon read snapshots"   on public.weekly_snapshots;
drop policy if exists "anon insert snapshots" on public.weekly_snapshots;
drop policy if exists "anon update snapshots" on public.weekly_snapshots;
drop policy if exists "anon delete snapshots" on public.weekly_snapshots;

-- dashboard_state: anon 정책 제거
drop policy if exists "anon can read"   on public.dashboard_state;
drop policy if exists "anon can insert" on public.dashboard_state;
drop policy if exists "anon can update" on public.dashboard_state;

-- 인덱스 뷰: 호출자 권한으로 RLS 적용 + anon 회수 (앱은 직접 안 쓰지만 보안상 잠금)
alter view public.weekly_snapshots_index set (security_invoker = true);
revoke all on public.weekly_snapshots_index from anon;
