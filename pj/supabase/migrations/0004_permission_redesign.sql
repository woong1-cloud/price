-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql ~ 0003_phase3.sql 실행 이후)

alter table user_brand_roles drop constraint if exists user_brand_roles_tier_check;
alter table user_brand_roles add constraint user_brand_roles_tier_check
  check (tier in ('2차','3차','4차'));

-- 기존 3차(구 "요청자" 의미)를 4차로 옮겨서 '3차'를 새 의미(실무자)로 비워둔다.
update user_brand_roles set tier = '4차' where tier = '3차';
