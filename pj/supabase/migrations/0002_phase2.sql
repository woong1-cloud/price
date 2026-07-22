-- Supabase SQL Editor에 붙여넣어 실행한다. (0001_init.sql 실행 이후)

-- 1) requirements.status CHECK 에 '중복' 추가
alter table requirements drop constraint if exists requirements_status_check;
alter table requirements add constraint requirements_status_check
  check (status in ('대기','요청','검토','정책정의','진행중','완료','중복'));

-- 2) 요구사항당 이미지 여러 장
create table requirement_images (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id) on delete cascade,
  brand_id uuid not null references brands(id),
  storage_path text not null,
  content_type text,
  byte_size integer,
  sort_order integer not null default 0,
  uploaded_by uuid references team_members(id),
  created_at timestamptz not null default now()
);
create index idx_requirement_images_req on requirement_images (requirement_id);

-- 3) pg_trgm (중복 후보 유사도)
create extension if not exists pg_trgm;

-- 4) 중복 병합을 원자적으로 처리하는 함수
create or replace function merge_requirement(p_source uuid, p_target uuid, p_member uuid)
returns void language plpgsql as $$
declare
  v_source requirements%rowtype;
  v_target requirements%rowtype;
begin
  perform 1 from requirements where id in (p_source, p_target) order by id for update;
  select * into v_source from requirements where id = p_source;
  select * into v_target from requirements where id = p_target;

  update requirements set status = '중복', updated_at = now() where id = p_source;

  insert into change_logs (requirement_id, brand_id, changed_by, change_type,
                           field_name, old_value, new_value, comment)
  values (p_source, v_source.brand_id, p_member, '중복병합',
          'status', v_source.status, '중복',
          format('''%s'' 요청에 병합 (#%s)', v_target.title, p_target));

  update requirements set duplicate_count = duplicate_count + 1, updated_at = now()
    where id = p_target;

  insert into duplicate_links (requirement_id, brand_id, linked_requester, linked_note)
  values (p_target, v_target.brand_id, v_source.requester,
          format('%s (#%s)', v_source.title, p_source));
end;
$$;
