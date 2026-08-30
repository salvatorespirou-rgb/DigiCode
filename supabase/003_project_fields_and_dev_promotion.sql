-- DigiCode — Phase 2b: extra project fields + real dev promotion on signup
-- Run this once in the Supabase SQL Editor, after 002_projects_chats_developers.sql.

alter table public.projects drop column if exists form_lines;
alter table public.projects add column if not exists client_discord text;
alter table public.projects add column if not exists client_mobile text;
alter table public.projects add column if not exists details text;
alter table public.projects add column if not exists review jsonb;

alter table public.developers add column if not exists username text;

-- When someone signs up with an email already listed in `developers`, promote
-- their new profile straight to role='dev' and copy over their rank — this is
-- what makes "Create Developer" in the portal actually grant real access,
-- rather than just adding a local-only display entry.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_rank text;
begin
  select rank into matched_rank from public.developers where email = new.email;

  if matched_rank is not null then
    insert into public.profiles (id, email, role, name)
    values (new.id, new.email, 'dev', (select name from public.developers where email = new.email limit 1));
  else
    insert into public.profiles (id, email)
    values (new.id, new.email);
  end if;

  return new;
end;
$$;
