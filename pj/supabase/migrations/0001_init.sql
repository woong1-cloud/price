-- Supabase SQL Editor에 붙여넣어 실행한다.
create extension if not exists "pgcrypto";

create table team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  is_global_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  workflow_template text not null default '표준' check (workflow_template in ('표준','커스텀')),
  is_active boolean not null default true,
  created_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

create table user_brand_roles (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id),
  brand_id uuid not null references brands(id),
  tier text not null check (tier in ('2차','3차')),
  sub_role text check (sub_role in ('기획','개발','뷰어')),
  created_at timestamptz not null default now(),
  unique (team_member_id, brand_id)
);

create table brand_categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  category_name text not null,
  sort_order integer not null default 0
);

create table requirements (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  priority text,
  urgency text,
  request_date date not null default current_date,
  requester uuid references team_members(id),
  status text not null default '대기' check (status in ('대기','요청','검토','정책정의','진행중','완료')),
  category uuid references brand_categories(id),
  title text not null,
  as_is text,
  to_be text,
  note text,
  assignee uuid references team_members(id),
  completed_at timestamptz,
  duplicate_count integer not null default 0,
  sprint_tag text,
  is_confidential boolean not null default false,
  screenshot_url text,
  annotated_image_url text,
  annotation_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table change_logs (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id),
  brand_id uuid not null references brands(id),
  changed_by uuid references team_members(id),
  change_type text not null,
  field_name text,
  old_value text,
  new_value text,
  comment text,
  created_at timestamptz not null default now()
);

create table duplicate_links (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references requirements(id),
  brand_id uuid not null references brands(id),
  linked_requester uuid references team_members(id),
  linked_note text,
  created_at timestamptz not null default now()
);

create table in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id),
  requirement_id uuid references requirements(id),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_requirements_brand_id on requirements (brand_id);
create index idx_user_brand_roles_member on user_brand_roles (team_member_id);
create index idx_user_brand_roles_brand on user_brand_roles (brand_id);
create index idx_brand_categories_brand on brand_categories (brand_id);
create index idx_notifications_member on in_app_notifications (team_member_id);
