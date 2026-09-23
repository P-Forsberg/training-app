-- Share a program with another user by e-mail. Runs as definer because the
-- caller cannot read auth.users; it only reveals whether the address exists
-- to the owner of the program being shared.

alter table public.program_shares add column shared_with_email text;

create or replace function public.share_program(p_program_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  recipient uuid;
  share_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.programs where id = p_program_id and owner = me and deleted_at is null) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  select id into recipient from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if recipient is null then
    raise exception 'no user with that e-mail' using errcode = 'P0002';
  end if;
  if recipient = me then
    raise exception 'cannot share with yourself' using errcode = '22023';
  end if;

  select id into share_id from public.program_shares
  where program_id = p_program_id and shared_with = recipient and deleted_at is null;
  if share_id is not null then
    return share_id;
  end if;

  insert into public.program_shares (owner, program_id, shared_with, shared_with_email, role)
  values (me, p_program_id, recipient, lower(trim(p_email)), 'viewer')
  returning id into share_id;
  return share_id;
end;
$$;

revoke all on function public.share_program(uuid, text) from public, anon;
grant execute on function public.share_program(uuid, text) to authenticated;
