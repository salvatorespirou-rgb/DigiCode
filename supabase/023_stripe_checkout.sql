-- DigiCode — Stripe checkout foundation
-- Run this in the Supabase SQL Editor after 022_site_analytics.sql.
--
-- This is the half of the payment system that does NOT need Stripe keys, and
-- it is deliberately the half that carries the security. Two rules shape it:
--
--   1. The browser never states a price. It sends SKUs and quantities; the
--      server looks up what those actually cost. Otherwise anyone can edit
--      js/main.js in dev tools and buy the $1000 build for $1.
--
--   2. The Stripe secret key never appears here or anywhere the browser can
--      reach. It goes in Vault (same as the Resend key in 018) and is read
--      only by the Edge Function.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- The price list. This is the only place prices are authoritative.
-- ---------------------------------------------------------------------------

create table if not exists public.product_catalog (
  sku             text primary key,
  name            text not null,
  kind            text not null check (kind in ('one_time', 'subscription')),
  bill_interval   text check (bill_interval in ('week', 'month')),
  amount_cents    integer not null check (amount_cents > 0),
  currency        text not null default 'aud',
  stripe_price_id text,                    -- filled in once the prices exist in Stripe
  active          boolean not null default true,
  sort_order      integer not null default 0,

  -- A subscription must say how often it bills; a one-off must not.
  constraint catalog_interval_matches_kind check (
    (kind = 'subscription' and bill_interval is not null) or
    (kind = 'one_time'     and bill_interval is null)
  )
);

alter table public.product_catalog enable row level security;

-- Anyone may read the price list — these are the numbers already printed on
-- the website. Only the team may change them.
drop policy if exists "Anyone can read the price list" on public.product_catalog;
create policy "Anyone can read the price list"
  on public.product_catalog for select
  using (active);

drop policy if exists "Devs can manage the price list" on public.product_catalog;
create policy "Devs can manage the price list"
  on public.product_catalog for all
  using (public.is_dev()) with check (public.is_dev());

-- Seeded to match builds.html and subscription.html exactly. If the site
-- prices change, change them here in the same commit.
insert into public.product_catalog (sku, name, kind, bill_interval, amount_cents, sort_order) values
  ('build-basic',       'Basic Build',        'one_time',     null,     15000, 10),
  ('build-common',      'Common Build',       'one_time',     null,     50000, 20),
  ('build-ultimate',    'Ultimate Build',     'one_time',     null,    100000, 30),
  ('mgmt-silver-month', 'Silver — monthly',   'subscription', 'month',   8000, 40),
  ('mgmt-gold-month',   'Gold — monthly',     'subscription', 'month',  12500, 50),
  ('mgmt-platinum-month','Platinum — monthly','subscription', 'month',  50000, 60),
  ('mgmt-silver-week',  'Silver — weekly',    'subscription', 'week',    2000, 70),
  ('mgmt-gold-week',    'Gold — weekly',      'subscription', 'week',    3125, 80),
  ('mgmt-platinum-week','Platinum — weekly',  'subscription', 'week',   12500, 90)
on conflict (sku) do update
  set name          = excluded.name,
      kind          = excluded.kind,
      bill_interval = excluded.bill_interval,
      amount_cents  = excluded.amount_cents,
      sort_order    = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id                  bigint generated always as identity primary key,
  reference           uuid not null default gen_random_uuid(),
  stripe_session_id   text,
  customer_email      text,
  customer_name       text,
  items               jsonb not null default '[]'::jsonb,
  subtotal_cents      integer not null default 0,
  discount_code       text,
  discount_cents      integer not null default 0,
  total_cents         integer not null default 0,
  currency            text not null default 'aud',
  status              text not null default 'pending'
                        check (status in ('pending', 'paid', 'failed', 'cancelled')),
  project_id          text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create unique index if not exists orders_reference_idx on public.orders (reference);
create unique index if not exists orders_session_idx
  on public.orders (stripe_session_id) where stripe_session_id is not null;
create index if not exists orders_created_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

-- No anon policy at all. Visitors create orders only through the function
-- below, and can never read the table back.
drop policy if exists "Devs can view orders" on public.orders;
create policy "Devs can view orders"
  on public.orders for select
  using (public.is_dev());

drop policy if exists "Clients can view their own orders" on public.orders;
create policy "Clients can view their own orders"
  on public.orders for select
  using (customer_email = (auth.jwt() ->> 'email'));

-- ---------------------------------------------------------------------------
-- quote_cart — the server's own arithmetic
--
-- Give it [{"sku": "...", "qty": 1}, ...] and a code; it returns what the
-- order actually costs. The cart page uses it to display totals and the Edge
-- Function uses it to price the Stripe session, so the customer can never see
-- one number and be charged another.
-- ---------------------------------------------------------------------------

create or replace function public.quote_cart(
  p_items jsonb,
  p_code  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_line            jsonb;
  v_lines           jsonb := '[]'::jsonb;
  v_onetime         integer := 0;
  v_recurring       integer := 0;
  v_disc            record;
  v_disc_code       text := null;
  v_disc_onetime    integer := 0;
  v_disc_recurring  integer := 0;
  v_qty             integer;
  v_row             record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) > 20 then
    raise exception 'too many items';
  end if;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    -- Quantity is clamped, never trusted.
    v_qty := greatest(1, least(coalesce((v_line ->> 'qty')::int, 1), 10));

    select * into v_row
    from public.product_catalog
    where sku = (v_line ->> 'sku') and active;

    if not found then
      raise exception 'unknown item: %', coalesce(v_line ->> 'sku', '(null)');
    end if;

    if v_row.kind = 'one_time' then
      v_onetime := v_onetime + (v_row.amount_cents * v_qty);
    else
      v_recurring := v_recurring + (v_row.amount_cents * v_qty);
    end if;

    v_lines := v_lines || jsonb_build_object(
      'sku',           v_row.sku,
      'name',          v_row.name,
      'kind',          v_row.kind,
      'bill_interval', v_row.bill_interval,
      'qty',           v_qty,
      'unit_cents',    v_row.amount_cents,
      'line_cents',    v_row.amount_cents * v_qty
    );
  end loop;

  -- Discount, re-validated here rather than taken from the browser.
  if coalesce(trim(p_code), '') <> '' then
    select * into v_disc from public.validate_discount_code(p_code);

    if found then
      v_disc_code := v_disc.code;

      if v_disc.applies_to in ('one_time', 'both') then
        v_disc_onetime := case
          when v_disc.kind = 'percent' then floor(v_onetime * v_disc.amount / 100.0)
          else least(v_onetime, (v_disc.amount * 100)::int)
        end;
      end if;

      if v_disc.applies_to in ('subscription', 'both') then
        v_disc_recurring := case
          when v_disc.kind = 'percent' then floor(v_recurring * v_disc.amount / 100.0)
          else least(v_recurring, (v_disc.amount * 100)::int)
        end;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'lines',                    v_lines,
    'one_time_cents',           v_onetime,
    'recurring_cents',          v_recurring,
    'discount_code',            v_disc_code,
    'discount_one_time_cents',  v_disc_onetime,
    'discount_recurring_cents', v_disc_recurring,
    'due_today_cents',          greatest(0, v_onetime - v_disc_onetime),
    'recurring_due_cents',      greatest(0, v_recurring - v_disc_recurring),
    'currency',                 'aud'
  );
end;
$$;

revoke all on function public.quote_cart(jsonb, text) from public;
grant execute on function public.quote_cart(jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order recording. Called by the Edge Function (service role), never by a
-- browser — hence no anon grant.
-- ---------------------------------------------------------------------------

create or replace function public.create_pending_order(
  p_items jsonb,
  p_code  text,
  p_email text,
  p_name  text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  q   jsonb;
  row public.orders;
begin
  q := public.quote_cart(p_items, p_code);

  insert into public.orders (
    customer_email, customer_name, items, subtotal_cents,
    discount_code, discount_cents, total_cents
  ) values (
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_name,  '')), ''),
    q -> 'lines',
    (q ->> 'one_time_cents')::int,
    q ->> 'discount_code',
    (q ->> 'discount_one_time_cents')::int,
    (q ->> 'due_today_cents')::int
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.create_pending_order(jsonb, text, text, text) from public;
revoke execute on function public.create_pending_order(jsonb, text, text, text) from anon;

-- Marks an order paid and opens the project. Idempotent: replaying the same
-- Stripe webhook (which Stripe does retry) will not create two projects.
create or replace function public.mark_order_paid(
  p_reference uuid,
  p_session   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders;
  v_project  text;
  v_summary  text;
begin
  select * into o from public.orders where reference = p_reference for update;
  if not found then
    raise exception 'unknown order';
  end if;

  if o.status = 'paid' then
    return;                       -- already handled; webhook retry
  end if;

  select string_agg(
           (l ->> 'name') || case when (l ->> 'qty')::int > 1
                                  then ' x' || (l ->> 'qty') else '' end,
           ' · ')
    into v_summary
  from jsonb_array_elements(o.items) l;

  insert into public.projects (status, service, client_name, client_email, details)
  values (
    'pending',
    'Paid order',
    o.customer_name,
    o.customer_email,
    coalesce(v_summary, 'Order') || ' — paid ' ||
      to_char((o.total_cents / 100.0), 'FM999999990.00') || ' AUD'
  )
  returning id into v_project;

  update public.orders
     set status            = 'paid',
         paid_at           = now(),
         stripe_session_id = coalesce(p_session, stripe_session_id),
         project_id        = v_project
   where id = o.id;

  if o.discount_code is not null then
    perform public.redeem_discount_code(o.discount_code);
  end if;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text) from public;
revoke execute on function public.mark_order_paid(uuid, text) from anon;
