-- DigiCode — cancelling and deleting projects
-- Run this in the Supabase SQL Editor after 025_project_kind.sql.
--
-- Two different actions, deliberately:
--
--   Cancel  keeps the row and marks it cancelled. Right for a real job that
--           fell through — a paid order especially, where throwing away the
--           record would also throw away the money trail.
--   Delete  removes the row entirely. Right for test rows, spam and
--           duplicates, and nothing else.
--
-- 004 let any dev delete a project. That is too wide now that a card can
-- represent a real payment, so both actions are narrowed to the same people
-- who may clear live chats: Lead Developer, anyone granted the permission, or
-- the owner account that isn't on the roster.

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
    check (status in ('pending', 'assigned', 'finished', 'cancelled'));

alter table public.projects
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text;

create or replace function public.can_remove_projects()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_dev()
     and (
       not exists (
         select 1 from public.developers
         where lower(email) = lower(auth.jwt() ->> 'email')
       )
       or exists (
         select 1 from public.developers
         where lower(email) = lower(auth.jwt() ->> 'email')
           and (rank = 'Lead Developer' or permissions ? 'Delete Projects')
       )
     );
$$;

revoke all on function public.can_remove_projects() from public;
revoke execute on function public.can_remove_projects() from anon;
grant execute on function public.can_remove_projects() to authenticated;

-- Replace 004's blanket delete policy with the narrower one.
drop policy if exists "Devs can delete projects" on public.projects;
drop policy if exists "Permitted devs can delete projects" on public.projects;
create policy "Permitted devs can delete projects"
  on public.projects for delete
  using (public.can_remove_projects());

-- Cancelling is an update, and 002 already lets devs update projects, so any
-- dev can cancel. That is intentional: cancelling is reversible and loses
-- nothing, deleting is neither.
create or replace function public.cancel_project(
  p_id     text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dev() then
    raise exception 'Not authorised';
  end if;

  update public.projects
     set status           = 'cancelled',
         cancelled_at     = now(),
         cancelled_reason = left(coalesce(p_reason, ''), 500)
   where id = p_id
     and status <> 'cancelled';
end;
$$;

revoke all on function public.cancel_project(text, text) from public;
revoke execute on function public.cancel_project(text, text) from anon;
grant execute on function public.cancel_project(text, text) to authenticated;

-- Putting one back, in case something is cancelled by mistake.
create or replace function public.restore_project(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dev() then
    raise exception 'Not authorised';
  end if;

  update public.projects
     set status           = 'pending',
         cancelled_at     = null,
         cancelled_reason = null
   where id = p_id and status = 'cancelled';
end;
$$;

revoke all on function public.restore_project(text) from public;
revoke execute on function public.restore_project(text) from anon;
grant execute on function public.restore_project(text) to authenticated;
