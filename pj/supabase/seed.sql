-- 0001_init.sql 실행 후, Supabase SQL Editor에 붙여넣어 실행한다.
insert into team_members (id, name, is_active, is_global_admin) values
 ('11111111-1111-1111-1111-111111111111','김관리', true, true),
 ('22222222-2222-2222-2222-222222222222','박스파오', true, false),
 ('33333333-3333-3333-3333-333333333333','이기획', true, false),
 ('44444444-4444-4444-4444-444444444444','최개발', true, false),
 ('55555555-5555-5555-5555-555555555555','정뉴발', true, false);

insert into brands (id, name, code, workflow_template, is_active, created_by) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','스파오','spao','표준', true, '11111111-1111-1111-1111-111111111111'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','뉴발란스','nb','표준', true, '11111111-1111-1111-1111-111111111111');

insert into user_brand_roles (team_member_id, brand_id, tier, sub_role) values
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2차', null),
 ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','3차','기획'),
 ('44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','3차','개발'),
 ('55555555-5555-5555-5555-555555555555','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','2차', null);

insert into brand_categories (brand_id, category_name, sort_order) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','UI/UX', 1),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','결제', 2),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','검색', 3),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','UI/UX', 1),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','배송', 2);
