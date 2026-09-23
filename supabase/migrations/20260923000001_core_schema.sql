-- Core schema: every table has id, owner, created_at, updated_at (client clock, LWW key),
-- server_updated_at (server clock, pull cursor) and deleted_at (soft delete).

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Server clock for the pull cursor. Always overwritten, never trusted from the client.
create or replace function public.tg_set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  if tg_op = 'INSERT' and new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Last-write-wins: an update carrying an older updated_at than the stored row is ignored.
-- The owner of a row can never change.
create or replace function public.tg_lww_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'owner is immutable' using errcode = '42501';
  end if;
  if new.updated_at < old.updated_at then
    return null; -- stale write, keep the newer row
  end if;
  return new;
end;
$$;

-- Attaches the standard triggers to a table.
create or replace function public.attach_row_triggers(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create trigger a_lww_guard before update on %s for each row execute function public.tg_lww_guard()', tbl);
  execute format('create trigger b_server_updated_at before insert or update on %s for each row execute function public.tg_set_server_updated_at()', tbl);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  owner uuid not null references auth.users on delete cascade,
  display_name text,
  locale text not null default 'sv',
  units text not null default 'metric' check (units in ('metric')),
  theme text not null default 'night' check (theme in ('night', 'day', 'logbook', 'system')),
  race_date date,
  goal text,
  injury_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (id = owner)
);

-- ---------------------------------------------------------------------------
-- Exercise catalog: global rows (owner is null) plus each user's own
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users on delete cascade,
  canonical_name text not null,
  aliases text[] not null default '{}',
  category text,
  movement_pattern text check (movement_pattern in ('squat', 'hinge', 'push', 'pull', 'lunge', 'core', 'carry', 'mobility', 'other')),
  is_barbell boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Programs (planned layer)
-- ---------------------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  name text not null,
  discipline text,
  start_date date not null,
  race_date date,
  weeks int check (weeks >= 0),
  source text not null check (source in ('xlsx', 'image', 'ai', 'manual')),
  source_meta jsonb not null default '{}',
  schema_version int not null default 1,
  is_template boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  week_no int not null check (week_no >= 1),
  start_date date not null check (extract(isodow from start_date) = 1),
  phase text,
  focus_text text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index program_weeks_program_week_uniq on public.program_weeks (program_id, week_no) where deleted_at is null;

create table public.program_notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  section text not null,
  key text not null,
  value text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  program_week_id uuid references public.program_weeks on delete set null,
  date date not null,
  day_of_week int not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
  type text not null check (type in ('run', 'strength', 'other', 'rest')),
  title text,
  sort int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (day_of_week = extract(isodow from date))
);

create table public.planned_items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  planned_session_id uuid not null references public.planned_sessions on delete cascade,
  sort int not null default 0,
  kind text not null check (kind in ('distance', 'duration', 'exercise')),
  exercise_id uuid references public.exercises on delete set null,
  raw_text text,
  sets int check (sets > 0),
  reps int check (reps > 0),
  reps_max int check (reps_max > 0),
  rep_scheme text check (rep_scheme in ('fixed', 'range', 'amrap', 'rm', 'time')),
  load numeric,
  load_unit text check (load_unit in ('kg', 'percent', 'rpe', 'bodyweight', 'band')),
  per_side boolean not null default false,
  distance_km numeric check (distance_km >= 0),
  duration_sec int check (duration_sec >= 0),
  parse_confidence numeric not null default 1 check (parse_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Shoes
-- ---------------------------------------------------------------------------

create table public.shoes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  name text not null,
  brand text,
  model text,
  surface_type text not null default 'road' check (surface_type in ('road', 'trail', 'mixed')),
  start_km numeric not null default 0 check (start_km >= 0),
  retire_km numeric not null default 800 check (retire_km >= 0),
  purchased_on date,
  retired_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Logged layer. Never writes to planned_*.
-- ---------------------------------------------------------------------------

create table public.logged_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  planned_session_id uuid references public.planned_sessions on delete set null,
  date date not null,
  type text not null check (type in ('run', 'strength', 'other', 'rest')),
  title text,
  status text not null check (status in ('done', 'partial', 'skipped', 'moved')),
  moved_from date,
  feel int check (feel between 1 and 5),
  rpe numeric check (rpe between 0 and 10),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.logged_runs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  logged_session_id uuid not null unique references public.logged_sessions on delete cascade,
  distance_km numeric check (distance_km >= 0),
  duration_sec int check (duration_sec >= 0),
  surface text check (surface in ('road', 'gravel', 'trail', 'technical', 'treadmill')),
  elevation_m int,
  is_night boolean not null default false,
  shoe_id uuid references public.shoes on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.logged_sets (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  logged_session_id uuid not null references public.logged_sessions on delete cascade,
  planned_item_id uuid references public.planned_items on delete set null,
  exercise_id uuid references public.exercises on delete set null,
  set_no int not null check (set_no >= 1),
  weight_kg numeric check (weight_kg >= 0),
  reps int check (reps >= 0),
  rpe numeric check (rpe between 0 and 10),
  duration_sec int check (duration_sec >= 0),
  is_warmup boolean not null default false,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- AI proposals and the mutation log that drives undo
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid references public.programs on delete cascade,
  prompt text,
  rationale text,
  diff jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'undone')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.mutations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  batch_id uuid not null,
  seq int not null default 0,
  entity text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  proposal_id uuid references public.proposals on delete set null,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Sharing, import profiles, AI usage
-- ---------------------------------------------------------------------------

create table public.program_shares (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  shared_with uuid not null references auth.users on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (shared_with <> owner)
);
create unique index program_shares_uniq on public.program_shares (program_id, shared_with) where deleted_at is null;

create table public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  name text not null,
  adapter text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  month date not null check (extract(day from month) = 1),
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner, month)
);

-- ---------------------------------------------------------------------------
-- Parent/child owner consistency: a child row must belong to its parent's owner.
-- Foreign keys ignore RLS, so without this a user could attach rows to another
-- user's program.
-- ---------------------------------------------------------------------------

create or replace function public.tg_check_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_table text := tg_argv[0];
  parent_col text := tg_argv[1];
  parent_id uuid;
  parent_owner uuid;
begin
  execute format('select ($1).%I', parent_col) into parent_id using new;
  if parent_id is null then
    return new;
  end if;
  execute format('select owner from public.%I where id = $1', parent_table) into parent_owner using parent_id;
  if parent_owner is null or parent_owner <> new.owner then
    raise exception '% row must belong to the owner of its % row', tg_table_name, parent_table using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger c_parent_owner before insert or update on public.program_weeks
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');
create trigger c_parent_owner before insert or update on public.program_notes
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');
create trigger c_parent_owner before insert or update on public.planned_sessions
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');
create trigger c_parent_owner_week before insert or update on public.planned_sessions
  for each row execute function public.tg_check_parent_owner('program_weeks', 'program_week_id');
create trigger c_parent_owner before insert or update on public.planned_items
  for each row execute function public.tg_check_parent_owner('planned_sessions', 'planned_session_id');
create trigger c_parent_owner_program before insert or update on public.planned_items
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');
create trigger c_parent_owner before insert or update on public.logged_runs
  for each row execute function public.tg_check_parent_owner('logged_sessions', 'logged_session_id');
create trigger c_parent_owner_shoe before insert or update on public.logged_runs
  for each row execute function public.tg_check_parent_owner('shoes', 'shoe_id');
create trigger c_parent_owner before insert or update on public.logged_sets
  for each row execute function public.tg_check_parent_owner('logged_sessions', 'logged_session_id');
create trigger c_parent_owner before insert or update on public.program_shares
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');
create trigger c_parent_owner before insert or update on public.proposals
  for each row execute function public.tg_check_parent_owner('programs', 'program_id');

-- Exercises referenced from a user's rows must be global or the user's own.
create or replace function public.tg_check_exercise_visible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ex_owner uuid;
  ex_found boolean;
begin
  if new.exercise_id is null then
    return new;
  end if;
  select true, owner into ex_found, ex_owner from public.exercises where id = new.exercise_id;
  if not coalesce(ex_found, false) or (ex_owner is not null and ex_owner <> new.owner) then
    raise exception 'exercise % is not available to this user', new.exercise_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger d_exercise_visible before insert or update on public.planned_items
  for each row execute function public.tg_check_exercise_visible();
create trigger d_exercise_visible before insert or update on public.logged_sets
  for each row execute function public.tg_check_exercise_visible();

-- ---------------------------------------------------------------------------
-- Standard row triggers on every table
-- ---------------------------------------------------------------------------

select public.attach_row_triggers(t::regclass)
from unnest(array[
  'public.profiles', 'public.exercises', 'public.programs', 'public.program_weeks',
  'public.program_notes', 'public.planned_sessions', 'public.planned_items', 'public.shoes',
  'public.logged_sessions', 'public.logged_runs', 'public.logged_sets', 'public.proposals',
  'public.mutations', 'public.program_shares', 'public.import_profiles', 'public.ai_usage'
]) as t;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index planned_sessions_program_date on public.planned_sessions (program_id, date);
create index planned_items_session on public.planned_items (planned_session_id);
create index logged_sessions_owner_date on public.logged_sessions (owner, date);
create index logged_sets_session on public.logged_sets (logged_session_id);
create index logged_runs_shoe on public.logged_runs (shoe_id);
create index program_weeks_program_week on public.program_weeks (program_id, week_no);
create index mutations_batch on public.mutations (batch_id);

-- Pull cursor index on every table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'exercises', 'programs', 'program_weeks', 'program_notes', 'planned_sessions',
    'planned_items', 'shoes', 'logged_sessions', 'logged_runs', 'logged_sets', 'proposals',
    'mutations', 'program_shares', 'import_profiles', 'ai_usage'
  ] loop
    execute format('create index %I on public.%I (owner, server_updated_at)', t || '_owner_sync', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shoe mileage view (RLS of the caller applies)
-- ---------------------------------------------------------------------------

create view public.shoe_mileage
with (security_invoker = true)
as
select
  s.id as shoe_id,
  s.owner,
  s.start_km + coalesce(sum(r.distance_km) filter (where r.deleted_at is null and ls.deleted_at is null), 0) as total_km
from public.shoes s
left join public.logged_runs r on r.shoe_id = s.id
left join public.logged_sessions ls on ls.id = r.logged_session_id
where s.deleted_at is null
group by s.id;

-- ---------------------------------------------------------------------------
-- New user → profile row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, owner, display_name)
  values (new.id, new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
