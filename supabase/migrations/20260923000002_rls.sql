-- Row Level Security. Explicit policies per operation, never "using (true)".
-- No DELETE policies anywhere: rows are soft-deleted via UPDATE of deleted_at,
-- and without a policy RLS rejects hard deletes.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True if the current user owns the program or it is shared with them.
create or replace function public.can_read_program(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = pid
      and p.deleted_at is null
      and (
        p.owner = (select auth.uid())
        or exists (
          select 1 from public.program_shares s
          where s.program_id = p.id
            and s.shared_with = (select auth.uid())
            and s.deleted_at is null
        )
      )
  );
$$;

-- True if some program owned by owner_id is shared with the current user.
-- Lets viewers of a shared program read the owner's custom exercises.
create or replace function public.shares_with_me(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.program_shares s
    where s.owner = owner_id
      and s.shared_with = (select auth.uid())
      and s.deleted_at is null
  );
$$;

revoke all on function public.can_read_program(uuid) from public, anon;
revoke all on function public.shares_with_me(uuid) from public, anon;
grant execute on function public.can_read_program(uuid) to authenticated;
grant execute on function public.shares_with_me(uuid) to authenticated;

-- Internal helpers are not part of the API.
revoke all on function public.attach_row_triggers(regclass) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere and remove anon access
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'exercises', 'programs', 'program_weeks', 'program_notes', 'planned_sessions',
    'planned_items', 'shoes', 'logged_sessions', 'logged_runs', 'logged_sets', 'proposals',
    'mutations', 'program_shares', 'import_profiles', 'ai_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
  end loop;
end;
$$;

revoke all on public.shoe_mileage from anon;

-- ---------------------------------------------------------------------------
-- Owner-only tables: select / insert / update where owner = auth.uid()
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'shoes', 'logged_sessions', 'logged_runs', 'logged_sets',
    'mutations', 'import_profiles'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner = (select auth.uid()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner = (select auth.uid()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))',
      t || '_update', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Program tables: owner writes, owner and share recipients read
-- ---------------------------------------------------------------------------

create policy programs_select on public.programs for select to authenticated
  using (owner = (select auth.uid()) or public.can_read_program(id));
create policy programs_insert on public.programs for insert to authenticated
  with check (owner = (select auth.uid()));
create policy programs_update on public.programs for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['program_weeks', 'program_notes', 'planned_sessions', 'planned_items'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner = (select auth.uid()) or public.can_read_program(program_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner = (select auth.uid()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))',
      t || '_update', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exercises: global rows readable by every signed-in user, own rows writable
-- ---------------------------------------------------------------------------

create policy exercises_select on public.exercises for select to authenticated
  using (owner is null or owner = (select auth.uid()) or public.shares_with_me(owner));
create policy exercises_insert on public.exercises for insert to authenticated
  with check (owner = (select auth.uid()));
create policy exercises_update on public.exercises for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Proposals: created by the AI Edge Function with the user's JWT
-- ---------------------------------------------------------------------------

create policy proposals_select on public.proposals for select to authenticated
  using (owner = (select auth.uid()));
create policy proposals_insert on public.proposals for insert to authenticated
  with check (owner = (select auth.uid()));
create policy proposals_update on public.proposals for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Program shares: the program owner manages, the recipient can see the row
-- ---------------------------------------------------------------------------

create policy program_shares_select on public.program_shares for select to authenticated
  using (owner = (select auth.uid()) or shared_with = (select auth.uid()));
create policy program_shares_insert on public.program_shares for insert to authenticated
  with check (owner = (select auth.uid()));
create policy program_shares_update on public.program_shares for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- AI usage: read-only for the owner; written by the Edge Function (service role)
-- ---------------------------------------------------------------------------

create policy ai_usage_select on public.ai_usage for select to authenticated
  using (owner = (select auth.uid()));
revoke insert, update on public.ai_usage from authenticated;
