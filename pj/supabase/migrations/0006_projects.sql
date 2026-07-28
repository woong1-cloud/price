-- Supabase SQL Editor에 붙여넣어 실행한다. (0001~0005 실행 이후)

-- 프로젝트: 브랜드에 속하지 않는 전사 단위
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner uuid references team_members(id),
  is_active boolean not null default true,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 전개 현황: 어느 브랜드에 어디까지 갔는지
create table project_brands (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  brand_id uuid not null references brands(id),
  status text not null default '전개예정'
    check (status in ('전개예정','진행중','적용완료')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, brand_id)
);

-- 요구사항 → 프로젝트 (1:N, 선택사항)
-- 프로젝트를 지워도 요구사항 자체는 유효한 업무 기록이므로 남긴다.
alter table requirements
  add column project_id uuid references projects(id) on delete set null;

create index idx_project_brands_project on project_brands (project_id);
create index idx_project_brands_brand on project_brands (brand_id);
create index idx_requirements_project on requirements (project_id);
