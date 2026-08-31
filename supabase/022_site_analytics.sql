-- DigiCode — first-party site analytics
-- Run this once in the Supabase SQL Editor, after 021_developer_roster_permissions.sql.
--
-- This replaces the hardcoded sample numbers on the portal dashboard with real
-- traffic. It is deliberately first-party and minimal: no third-party script, no
-- IP address, no user agent, no cookies, no full referrer URL. A visitor is a
-- random id this site generates and keeps in that browser's localStorage — it
-- says nothing about who they are and is useless to anyone else.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Raw page views
-- ---------------------------------------------------------------------------

create table if not exists public.page_views (
  id            bigint generated always as identity primary key,
  visitor_id    uuid not null,
  session_id    uuid not null,
  path          text not null,
  referrer_host text,
  load_ms       integer,
  created_at    timestamptz not null default now()
);

create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_session_idx on public.page_views (session_id, created_at);
create index if not exists page_views_visitor_idx on public.page_views (visitor_id, created_at desc);

alter table public.page_views enable row level security;

-- Devs read the raw table. There is deliberately no anon policy: visitors write
-- only through record_page_view() below, and can never read anything back.
drop policy if exists "Devs can view page views" on public.page_views;
create policy "Devs can view page views"
  on public.page_views for select
  using (public.is_dev());

-- ---------------------------------------------------------------------------
-- Write path — the only thing a visitor's browser may call
-- ---------------------------------------------------------------------------

create or replace function public.record_page_view(
  p_visitor  uuid,
  p_session  uuid,
  p_path     text,
  p_referrer text default null,
  p_load_ms  integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent  integer;
  v_global  integer;
  v_path    text;
  v_ref     text;
  v_load    integer;
begin
  if p_visitor is null or p_session is null or p_path is null then
    return;
  end if;

  -- Per-visitor cap: a real person does not load 120 pages an hour.
  select count(*) into v_recent
  from public.page_views
  where visitor_id = p_visitor and created_at > now() - interval '1 hour';
  if v_recent >= 120 then
    return;
  end if;

  -- Global circuit breaker, so a flood of invented visitor ids cannot fill
  -- the table. Real traffic will not come close to this for a long time.
  select count(*) into v_global
  from public.page_views
  where created_at > now() - interval '1 minute';
  if v_global >= 1000 then
    return;
  end if;

  -- Only ever store a site-relative path, never a full URL and never a query
  -- string (which can carry personal data).
  v_path := left(split_part(split_part(p_path, '?', 1), '#', 1), 200);
  if v_path = '' then
    v_path := '/';
  end if;

  -- Host only. "google.com", never the search terms that came with it.
  v_ref := nullif(left(regexp_replace(coalesce(p_referrer, ''), '^https?://([^/:]+).*$', '\1'), 100), '');

  v_load := least(greatest(coalesce(p_load_ms, 0), 0), 60000);
  if v_load = 0 then
    v_load := null;
  end if;

  insert into public.page_views (visitor_id, session_id, path, referrer_host, load_ms)
  values (p_visitor, p_session, v_path, v_ref, v_load);
end;
$$;

revoke all on function public.record_page_view(uuid, uuid, text, text, integer) from public;
grant execute on function public.record_page_view(uuid, uuid, text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read path — one call that returns the whole dashboard
-- ---------------------------------------------------------------------------

create or replace function public.site_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  -- Traffic figures are only ever shown to the team.
  if not public.is_dev() then
    raise exception 'Not authorised';
  end if;

  with
  -- Sessions in the current and previous 30-day windows.
  sess as (
    select session_id,
           visitor_id,
           min(created_at) as started_at,
           max(created_at) as ended_at,
           count(*)        as views
    from public.page_views
    where created_at > now() - interval '60 days'
    group by session_id, visitor_id
  ),
  cur  as (select * from sess where started_at > now() - interval '30 days'),
  prev as (select * from sess where started_at <= now() - interval '30 days'
                               and started_at >  now() - interval '60 days'),

  -- Twelve buckets across the window, for the sparklines.
  spark as (
    select gs.n,
           (select count(distinct s.session_id) from cur s
             where s.started_at >= now() - ((12 - gs.n) * interval '2.5 days')
               and s.started_at <  now() - ((11 - gs.n) * interval '2.5 days')) as sessions
    from generate_series(0, 11) as gs(n)
  ),

  -- People who got as far as a service page or the cart.
  intent as (
    select count(distinct session_id) as n
    from public.page_views
    where created_at > now() - interval '30 days'
      and (path like '%/services/%' or path like '%cart.html%' or path like '%subscription.html%')
  ),
  intent_prev as (
    select count(distinct session_id) as n
    from public.page_views
    where created_at <= now() - interval '30 days'
      and created_at >  now() - interval '60 days'
      and (path like '%/services/%' or path like '%cart.html%' or path like '%subscription.html%')
  ),

  orders      as (select count(*) as n from public.projects where created_at > now() - interval '30 days'),
  orders_prev as (select count(*) as n from public.projects
                   where created_at <= now() - interval '30 days'
                     and created_at >  now() - interval '60 days'),

  members      as (select count(*) as n from public.profiles),
  members_new  as (select count(*) as n from public.profiles where created_at > now() - interval '30 days'),

  -- "Where requests come from" — real orders by service, falling back to
  -- interest in the service pages while there are not many orders yet.
  by_service as (
    select service as label, count(*) as n
    from public.projects
    where created_at > now() - interval '90 days' and service is not null
    group by service
  ),
  by_page as (
    select path as label, count(distinct session_id) as n
    from public.page_views
    where created_at > now() - interval '30 days' and path like '%/services/%'
    group by path
  )

  select jsonb_build_object(
    'generated_at',        now(),
    'visitors',            (select count(*) from cur),
    'visitors_prev',       (select count(*) from prev),
    'unique_visitors',     (select count(distinct visitor_id) from cur),
    'unique_visitors_prev',(select count(distinct visitor_id) from prev),
    'page_views',          (select count(*) from public.page_views where created_at > now() - interval '30 days'),
    'members',             (select n from members),
    'members_new',         (select n from members_new),
    'requests_started',    (select n from intent),
    'requests_started_prev',(select n from intent_prev),
    'orders_sent',         (select n from orders),
    'orders_sent_prev',    (select n from orders_prev),
    'spark_sessions',      (select coalesce(jsonb_agg(sessions order by n), '[]'::jsonb) from spark),
    'avg_load_ms',         (select round(avg(load_ms)) from public.page_views
                             where created_at > now() - interval '30 days' and load_ms is not null),
    'bounce_pct',          (select case when count(*) = 0 then null
                                        else round(100.0 * count(*) filter (where views = 1) / count(*), 1) end
                             from cur),
    'avg_session_sec',     (select case when count(*) = 0 then null
                                        else round(avg(extract(epoch from (ended_at - started_at)))) end
                             from cur where views > 1),
    'by_service',          (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb) from by_service),
    'by_page',             (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb) from by_page),
    'top_referrers',       (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
                              select jsonb_build_object('label', referrer_host, 'n', count(distinct session_id)) as r
                              from public.page_views
                              where created_at > now() - interval '30 days' and referrer_host is not null
                              group by referrer_host order by count(distinct session_id) desc limit 6
                            ) t),
    'open_chats',          (select count(*) from public.visitor_chats where status = 'open'),
    'chats_30d',           (select count(*) from public.visitor_chats where created_at > now() - interval '30 days'),
    'first_view_at',       (select min(created_at) from public.page_views)
  ) into result;

  return result;
end;
$$;

revoke all on function public.site_stats() from public;
revoke execute on function public.site_stats() from anon;
grant execute on function public.site_stats() to authenticated;
