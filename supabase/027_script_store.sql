-- DigiCode — selling script files
-- Run this in the Supabase SQL Editor after 026_project_cancel_delete.sql.
--
-- The whole problem with selling a file is that a URL, once handed out, can be
-- forwarded. So the file itself is never reachable:
--
--   * the bucket is private, with no read policy for anyone but a dev
--   * the public product list is an RPC that does not return the file path
--   * a buyer gets a random token, not a link to the file
--   * the token is exchanged, server side, for a URL that expires in minutes
--
-- Someone who shares their token shares their own purchase, which is the same
-- exposure as sharing the zip — not a hole in the store.

-- ---------------------------------------------------------------------------
-- Where the files live
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'script-files',
  'script-files',
  false,                                    -- never public
  209715200,                                -- 200 MB
  array[
    'application/zip','application/x-zip-compressed','multipart/x-zip',
    'application/x-rar-compressed','application/vnd.rar','application/x-7z-compressed',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only the people who may manage the store can put a file in it. There is
-- deliberately no select policy for anon or a signed-in customer: downloads go
-- through a signed URL minted by the Edge Function, never direct access.
drop policy if exists "Script managers can upload" on storage.objects;
create policy "Script managers can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'script-files' and public.can_manage_scripts());

drop policy if exists "Script managers can read" on storage.objects;
create policy "Script managers can read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'script-files' and public.can_manage_scripts());

drop policy if exists "Script managers can replace" on storage.objects;
create policy "Script managers can replace"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'script-files' and public.can_manage_scripts());

drop policy if exists "Script managers can remove" on storage.objects;
create policy "Script managers can remove"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'script-files' and public.can_manage_scripts());

-- ---------------------------------------------------------------------------
-- Who may run the store. Lead Developer only, plus the owner account that is
-- not on the roster, plus anyone explicitly granted the permission.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_scripts()
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
           and (rank = 'Lead Developer' or permissions ? 'Manage Scripts')
       )
     );
$$;

revoke all on function public.can_manage_scripts() from public;
revoke execute on function public.can_manage_scripts() from anon;
grant execute on function public.can_manage_scripts() to authenticated;

-- ---------------------------------------------------------------------------
-- The products
-- ---------------------------------------------------------------------------

create table if not exists public.script_products (
  id           bigint generated always as identity primary key,
  slug         text not null,
  name         text not null,
  summary      text,                        -- one line, shown on the card
  description  text,                        -- the full write-up
  platform     text,                        -- FiveM, Roblox, Minecraft…
  version      text,
  price_cents  integer not null check (price_cents >= 0),
  file_path    text,                        -- never leaves the server
  file_name    text,
  file_bytes   bigint,
  active       boolean not null default false,
  sales_count  integer not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists script_products_slug_idx
  on public.script_products (lower(slug));

alter table public.script_products enable row level security;

-- No anon policy at all. The public list comes from list_scripts() below,
-- which omits file_path — otherwise anyone could read the storage key.
drop policy if exists "Devs can view scripts" on public.script_products;
create policy "Devs can view scripts"
  on public.script_products for select
  using (public.is_dev());

drop policy if exists "Script managers can change scripts" on public.script_products;
create policy "Script managers can change scripts"
  on public.script_products for all
  using (public.can_manage_scripts())
  with check (public.can_manage_scripts());

-- ---------------------------------------------------------------------------
-- What the storefront is allowed to see. Note the absent file_path.
-- ---------------------------------------------------------------------------

create or replace function public.list_scripts()
returns table (
  slug        text,
  name        text,
  summary     text,
  description text,
  platform    text,
  version     text,
  price_cents integer,
  file_bytes  bigint,
  sales_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select s.slug, s.name, s.summary, s.description, s.platform, s.version,
         s.price_cents, s.file_bytes, s.sales_count
  from public.script_products s
  where s.active and s.file_path is not null
  order by s.sales_count desc, s.created_at desc;
$$;

revoke all on function public.list_scripts() from public;
grant execute on function public.list_scripts() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who bought what
-- ---------------------------------------------------------------------------

create table if not exists public.script_purchases (
  id               bigint generated always as identity primary key,
  product_id       bigint not null references public.script_products (id) on delete restrict,
  buyer_email      text,
  order_reference  uuid,
  token            uuid not null default gen_random_uuid(),
  downloads        integer not null default 0,
  last_download_at timestamptz,
  created_at       timestamptz not null default now()
);

create unique index if not exists script_purchases_token_idx on public.script_purchases (token);
create index if not exists script_purchases_email_idx on public.script_purchases (lower(buyer_email));
create index if not exists script_purchases_order_idx on public.script_purchases (order_reference);

alter table public.script_purchases enable row level security;

drop policy if exists "Devs can view purchases" on public.script_purchases;
create policy "Devs can view purchases"
  on public.script_purchases for select
  using (public.is_dev());

-- A signed-in customer can see their own, so the portal can list them.
drop policy if exists "Buyers can view their own purchases" on public.script_purchases;
create policy "Buyers can view their own purchases"
  on public.script_purchases for select
  using (lower(buyer_email) = lower(auth.jwt() ->> 'email'));

-- ---------------------------------------------------------------------------
-- Pricing a script the same way everything else is priced: server side, from
-- a SKU. quote_cart() gains a "script:<slug>" branch so the browser still
-- never states a price.
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
  v_sku             text;
  v_script          record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) > 20 then
    raise exception 'too many items';
  end if;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, least(coalesce((v_line ->> 'qty')::int, 1), 10));
    v_sku := v_line ->> 'sku';

    if v_sku like 'script:%' then
      -- A script is a file: one copy is one copy, quantity is meaningless.
      v_qty := 1;

      select * into v_script
      from public.script_products
      where lower(slug) = lower(substring(v_sku from 8))
        and active and file_path is not null;

      if not found then
        raise exception 'unknown item: %', coalesce(v_sku, '(null)');
      end if;

      v_onetime := v_onetime + v_script.price_cents;

      v_lines := v_lines || jsonb_build_object(
        'sku',           v_sku,
        'name',          v_script.name,
        'kind',          'one_time',
        'bill_interval', null,
        'qty',           1,
        'unit_cents',    v_script.price_cents,
        'line_cents',    v_script.price_cents
      );
    else
      select * into v_row
      from public.product_catalog
      where sku = v_sku and active;

      if not found then
        raise exception 'unknown item: %', coalesce(v_sku, '(null)');
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
    end if;
  end loop;

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
-- Paying for a script creates the entitlement rather than a project. Replaces
-- the version in 025.
-- ---------------------------------------------------------------------------

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
  v_line     jsonb;
  v_script   record;
  v_scripts  int := 0;
  v_other    int := 0;
begin
  select * into o from public.orders where reference = p_reference for update;
  if not found then
    raise exception 'unknown order';
  end if;

  if o.status = 'paid' then
    return;                       -- already handled; webhook retry
  end if;

  for v_line in select * from jsonb_array_elements(o.items)
  loop
    if (v_line ->> 'sku') like 'script:%' then
      select * into v_script
      from public.script_products
      where lower(slug) = lower(substring((v_line ->> 'sku') from 8));

      if found then
        insert into public.script_purchases (product_id, buyer_email, order_reference)
        values (v_script.id, o.customer_email, o.reference);

        update public.script_products
           set sales_count = sales_count + 1
         where id = v_script.id;

        v_scripts := v_scripts + 1;
      end if;
    else
      v_other := v_other + 1;
    end if;
  end loop;

  select string_agg(
           (l ->> 'name') || case when (l ->> 'qty')::int > 1
                                  then ' x' || (l ->> 'qty') else '' end,
           ' · ')
    into v_summary
  from jsonb_array_elements(o.items) l;

  -- A pure script order is a download, not a job — it should not clutter
  -- Pending Projects with something that needs no work doing.
  if v_other > 0 then
    insert into public.projects (
      status, service, client_name, client_email, details, order_kind, amount_cents
    )
    values (
      'pending',
      coalesce(v_summary, 'Paid order'),
      o.customer_name,
      o.customer_email,
      coalesce(v_summary, 'Order') || ' — paid ' ||
        to_char((o.total_cents / 100.0), 'FM999999990.00') || ' AUD',
      'paid',
      o.total_cents
    )
    returning id into v_project;
  end if;

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

-- ---------------------------------------------------------------------------
-- What a buyer gets back after paying: their tokens, by order reference.
-- Anon-callable because they are not signed in at the success page — but the
-- reference is a uuid they only have because they completed that checkout.
-- ---------------------------------------------------------------------------

create or replace function public.downloads_for_order(p_reference uuid)
returns table (token uuid, name text, file_name text, file_bytes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.token, s.name, s.file_name, s.file_bytes
  from public.script_purchases p
  join public.script_products s on s.id = p.product_id
  join public.orders o on o.reference = p.order_reference
  where p.order_reference = p_reference
    and o.status = 'paid';
$$;

revoke all on function public.downloads_for_order(uuid) from public;
grant execute on function public.downloads_for_order(uuid) to anon, authenticated;

-- Used by the download Edge Function (service role) to resolve a token to a
-- file and count the download.
create or replace function public.redeem_download(p_token uuid)
returns table (file_path text, file_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select p.id as purchase_id, s.file_path, s.file_name
    into v
  from public.script_purchases p
  join public.script_products s on s.id = p.product_id
  join public.orders o on o.reference = p.order_reference
  where p.token = p_token and o.status = 'paid';

  if not found then
    return;
  end if;

  update public.script_purchases
     set downloads = downloads + 1,
         last_download_at = now()
   where id = v.purchase_id;

  file_path := v.file_path;
  file_name := v.file_name;
  return next;
end;
$$;

revoke all on function public.redeem_download(uuid) from public;
revoke execute on function public.redeem_download(uuid) from anon;
