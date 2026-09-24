-- Closed app: only e-mail addresses on the allowlist can get an account.
-- The list lives in schema `private`, which is not exposed through the API.
-- Addresses are added in the SQL editor, never in a migration (no personal data in the repo):
--   insert into private.allowed_emails (email) values ('namn@example.com');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_emails (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
-- RLS on with no policies: unreachable for API roles even if the schema were ever exposed.
alter table private.allowed_emails enable row level security;
revoke all on private.allowed_emails from public, anon, authenticated;

create or replace function private.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from private.allowed_emails a where a.email = lower(trim(new.email))
  ) then
    raise exception 'Registrering är stängd för den här e-postadressen.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_allowed_email() from public, anon, authenticated;

-- Runs for every way an account can be created: sign-up, invite, OAuth, admin API.
create trigger enforce_allowed_email
  before insert on auth.users
  for each row execute function private.enforce_allowed_email();
