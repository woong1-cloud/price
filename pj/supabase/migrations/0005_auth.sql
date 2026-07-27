-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql ~ 0004_permission_redesign.sql 실행 이후)

alter table team_members add column auth_user_id uuid unique references auth.users(id) on delete set null;
alter table team_members add column must_change_password boolean not null default true;

-- 최초 부트스트랩(수동, 1회만):
-- 1) Supabase 대시보드 Authentication 화면에서 최초 전체관리자 계정을 이메일+비밀번호로 직접 생성한다.
-- 2) 아래 SQL로 team_members와 연결한다(따옴표 안을 실제 값으로 교체):
--    update team_members
--    set auth_user_id = '<위에서 만든 auth.users의 id>', must_change_password = true
--    where id = '<최초 전체관리자의 team_members.id>';
-- 이후부터는 그 계정으로 로그인해 /admin/brands 화면에서 나머지 팀원 계정을 생성할 수 있다.
