-- DigiCode — a register of concept builds
-- Run this in the Supabase SQL Editor after 039_delete_orders.sql.
--
-- Concept builds are speculative site designs made to win an account — the
-- Mummy Inday's pitch is the first. They live as static folders under
-- /concepts/<slug>/ and until now nothing recorded that they existed, so the
-- only way to find one was to remember the URL.
--
-- This gives them a home in the portal: what exists, who it was built for,
-- whether it is listed on the public concepts page, and a way to pull one
-- down when a pitch is over.
--
-- One honest limitation, stated here because it matters and the portal says
-- it too: 'hidden' means UNLISTED, not access-controlled. The site is static
-- on GitHub Pages, so anyone holding the direct URL can still open the files.
-- Hiding removes it from the public page and from search; deleting the row
-- does not remove the folder from the repo. Both are deliberate — the
-- register tracks builds, it does not host them.

-- ---------------------------------------------------------------------------
-- Who may manage them: Lead Developer, anyone granted the permission, or the
-- owner account that isn't on the roster. Same shape as every other gate.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_concepts()
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
           and (rank = 'Lead Developer' or permissions ? 'Manage Concepts')
       )
     );
$$;

revoke all on function public.can_manage_concepts() from public;
revoke execute on function public.can_manage_concepts() from anon;
grant execute on function public.can_manage_concepts() to authenticated;

-- ---------------------------------------------------------------------------
-- The register
-- ---------------------------------------------------------------------------

create table if not exists public.concept_builds (
  id          bigint generated always as identity primary key,
  name        text not null,
  client      text,
  slug        text not null,
  url         text,
  summary     text,
  -- 'hidden'  — not on the public concepts page, not in search
  -- 'listed'  — shown publicly as work
  status      text not null default 'hidden'
                check (status in ('hidden', 'listed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists concept_builds_slug_idx
  on public.concept_builds (lower(slug));
create index if not exists concept_builds_status_idx
  on public.concept_builds (status);

alter table public.concept_builds enable row level security;

-- Any dev can see the whole register — it is a working list, and hiding
-- builds from the people who make them helps nobody.
drop policy if exists "Devs can view concept builds" on public.concept_builds;
create policy "Devs can view concept builds"
  on public.concept_builds for select
  using (public.is_dev());

-- The public page reads only what has been deliberately listed.
drop policy if exists "Anyone can view listed concept builds" on public.concept_builds;
create policy "Anyone can view listed concept builds"
  on public.concept_builds for select
  using (status = 'listed');

-- No insert/update/delete policies at all. Every write goes through the
-- functions below, so the permission check lives in exactly one place.

-- ---------------------------------------------------------------------------
-- save_concept_build — insert when p_id is null, otherwise update
-- ---------------------------------------------------------------------------

create or replace function public.save_concept_build(
  p_id      bigint,
  p_name    text,
  p_client  text,
  p_slug    text,
  p_url     text,
  p_summary text,
  p_status  text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     bigint;
  v_slug   text := lower(trim(coalesce(p_slug, '')));
  v_status text := coalesce(nullif(trim(p_status), ''), 'hidden');
begin
  if not public.can_manage_concepts() then
    raise exception 'not allowed';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'a concept build needs a name';
  end if;

  if v_slug = '' then
    raise exception 'a concept build needs a slug';
  end if;

  if v_status not in ('hidden', 'listed') then
    raise exception 'unknown status';
  end if;

  if p_id is null then
    insert into public.concept_builds (name, client, slug, url, summary, status)
    values (trim(p_name), nullif(trim(p_client), ''), v_slug,
            nullif(trim(p_url), ''), nullif(trim(p_summary), ''), v_status)
    returning id into v_id;
  else
    update public.concept_builds
       set name       = trim(p_name),
           client     = nullif(trim(p_client), ''),
           slug       = v_slug,
           url        = nullif(trim(p_url), ''),
           summary    = nullif(trim(p_summary), ''),
           status     = v_status,
           updated_at = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'no such concept build';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_concept_build(bigint, text, text, text, text, text, text) from public;
revoke execute on function public.save_concept_build(bigint, text, text, text, text, text, text) from anon;
grant execute on function public.save_concept_build(bigint, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_concept_status — the hide/list toggle on its own, so the common action
-- doesn't require sending every field back
-- ---------------------------------------------------------------------------

create or replace function public.set_concept_status(
  p_id     bigint,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_concepts() then
    raise exception 'not allowed';
  end if;

  if p_status not in ('hidden', 'listed') then
    raise exception 'unknown status';
  end if;

  update public.concept_builds
     set status = p_status, updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'no such concept build';
  end if;
end;
$$;

revoke all on function public.set_concept_status(bigint, text) from public;
revoke execute on function public.set_concept_status(bigint, text) from anon;
grant execute on function public.set_concept_status(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_concept_build — removes the register entry only. The folder in the
-- repo is not touched, and the portal says so before it asks.
-- ---------------------------------------------------------------------------

create or replace function public.delete_concept_build(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_concepts() then
    raise exception 'not allowed';
  end if;

  delete from public.concept_builds where id = p_id;
end;
$$;

revoke all on function public.delete_concept_build(bigint) from public;
revoke execute on function public.delete_concept_build(bigint) from anon;
grant execute on function public.delete_concept_build(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed the first one, hidden. It carries a real business's photography and
-- customer reviews and has not been approved by them, so it is deliberately
-- NOT listed publicly until Mummy Inday's says yes.
-- ---------------------------------------------------------------------------

insert into public.concept_builds (name, client, slug, url, summary, status)
values (
  'Mummy Inday''s Catering',
  'Mummy Inday''s Catering',
  'mummy-indays',
  'concepts/mummy-indays/index.html',
  'Cinematic scroll-driven redesign — pitch build. Uses the client''s own photography and reviews; keep hidden until they approve.',
  'hidden'
)
on conflict do nothing;
