-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql, 0002_phase2.sql 실행 이후)

-- 브랜드와 그 브랜드의 최초 2차 관리자를 한 트랜잭션으로 함께 만든다.
-- (관리자 없는 브랜드가 남는 부분 실패를 원천 차단)
create or replace function create_brand_with_admin(
  p_name text,
  p_code text,
  p_workflow_template text,
  p_admin_member_id uuid,
  p_created_by uuid
) returns uuid language plpgsql as $$
declare
  v_brand_id uuid;
begin
  insert into brands (name, code, workflow_template, created_by)
  values (p_name, p_code, p_workflow_template, p_created_by)
  returning id into v_brand_id;

  insert into user_brand_roles (team_member_id, brand_id, tier)
  values (p_admin_member_id, v_brand_id, '2차');

  return v_brand_id;
end;
$$;
