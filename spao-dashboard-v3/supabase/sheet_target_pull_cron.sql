-- ════════════════════════════════════════════════════════════════════════
-- sheet-target-pull cron — 매일 06:10 KST 자동 호출 등록
-- ────────────────────────────────────────────────────────────────────────
-- 사전 조건: pg_cron/pg_net 확장 설치 완료(ga4-pull 설정 시 이미 설치됨),
-- Vault 'ingest_key' 시크릿 등록 완료(ga4-pull과 동일 값 재사용).
--
-- ⚠ Postgres 서버 타임존은 기본 UTC. 06:10 KST(UTC+9)는 전날 21:10 UTC.
--
-- 검증 순서: 먼저 짧은 간격(예: '*/10 * * * *')으로 등록 → net._http_response에서
-- status_code=200, content에 {"ok":true,...} 확인 → 아래 최종 스케줄로 전환.
-- (진행 방법은 ga4_pull_cron_step2_schedule.sql과 동일 — 이미 검증된 패턴.)
-- ════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'sheet-target-pull-daily',
  '10 21 * * *',  -- 매일 06:10 KST = 21:10 UTC(전날)
  $cron$
  select net.http_post(
    url     := 'https://wtflegxxhmzcofojepuf.supabase.co/functions/v1/sheet-target-pull',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ingest_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);

-- ════════════════════════════════════════════════════════════════════════
-- 완료 조건 확인 (실행 후 몇 분 뒤)
-- ════════════════════════════════════════════════════════════════════════
-- select jobid, runid, status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'sheet-target-pull-daily')
-- order by start_time desc
-- limit 5;
--
-- select id, status_code, content::text, created
-- from net._http_response
-- order by created desc
-- limit 5;
--
-- status_code = 200 이고 content에 {"ok":true, ...}가 보이면 통과.

-- ════════════════════════════════════════════════════════════════════════
-- 참고: 스케줄만 바꾸고 싶을 때
-- ════════════════════════════════════════════════════════════════════════
-- select cron.alter_job(
--   job_id   := (select jobid from cron.job where jobname = 'sheet-target-pull-daily'),
--   schedule := '*/10 * * * *'
-- );

-- 완전히 중단하려면:
-- select cron.unschedule('sheet-target-pull-daily');
