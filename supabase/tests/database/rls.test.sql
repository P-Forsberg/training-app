-- pgTAP tests for RLS, owner checks and last-write-wins. Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Structural guarantees ------------------------------------------------------

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has RLS enabled'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')),
  0,
  'no policy uses (true)'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and cmd = 'DELETE'),
  0,
  'no delete policies (soft delete only)'
);

select is(
  (select count(*)::int
   from information_schema.columns c
   join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
   where c.table_schema = 'public' and c.column_name = 'owner'),
  (select count(*)::int from pg_tables where schemaname = 'public'),
  'every table has an owner column'
);

-- Fixtures -------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'user-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'user-b@example.test');

select is(
  (select count(*)::int from public.profiles where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')),
  2,
  'a profile is created for each new user'
);

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

insert into public.programs (id, owner, name, start_date, source)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Plan A', '2026-10-05', 'manual');

insert into public.planned_sessions (id, owner, program_id, date, day_of_week, type)
values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a',
        '10000000-0000-4000-8000-000000000001', '2026-10-06', 2, 'run');

select is((select count(*)::int from public.programs), 1, 'A sees own program');

select ok((select count(*) from public.exercises where owner is null) > 50, 'global exercise catalog is readable');

select throws_ok(
  $$ insert into public.programs (owner, name, start_date, source)
     values ('00000000-0000-4000-8000-00000000000b', 'Forged', '2026-10-05', 'manual') $$,
  '42501', null,
  'A cannot insert a row owned by B'
);

select throws_ok(
  $$ delete from public.programs where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'hard delete is not permitted'
);

-- Last-write-wins: stale update is ignored.
update public.programs set name = 'New', updated_at = '2030-01-01T00:00:00Z'
where id = '10000000-0000-4000-8000-000000000001';
update public.programs set name = 'Stale', updated_at = '2029-01-01T00:00:00Z'
where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select name from public.programs where id = '10000000-0000-4000-8000-000000000001'),
  'New',
  'an older updated_at does not overwrite a newer row'
);

-- Act as user B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is((select count(*)::int from public.programs), 0, 'B cannot see A''s program');
select is((select count(*)::int from public.planned_sessions), 0, 'B cannot see A''s sessions');

select throws_ok(
  $$ insert into public.planned_sessions (owner, program_id, date, day_of_week, type)
     values ('00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', '2026-10-07', 3, 'run') $$,
  '42501', null,
  'B cannot attach a session to A''s program'
);

update public.programs set name = 'Hijacked' where id = '10000000-0000-4000-8000-000000000001';

-- Back to A: share with B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select is(
  (select name from public.programs where id = '10000000-0000-4000-8000-000000000001'),
  'New',
  'B''s update of A''s program had no effect'
);

insert into public.program_shares (owner, program_id, shared_with)
values ('00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.programs), 1, 'B sees the shared program');
select is((select count(*)::int from public.planned_sessions), 1, 'B sees sessions of the shared program');

update public.planned_sessions set title = 'Edited by B' where id = '20000000-0000-4000-8000-000000000001';
select is(
  (select title from public.planned_sessions where id = '20000000-0000-4000-8000-000000000001'),
  null,
  'a share recipient cannot edit the plan'
);

-- Anonymous.
set local role anon;
select throws_ok($$ select * from public.programs $$, '42501', null, 'anon has no table access');

select * from finish();
rollback;
