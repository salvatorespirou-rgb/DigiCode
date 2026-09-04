-- DigiCode — delivery method, picked separately from category
-- Run this in the Supabase SQL Editor after 034_fix_mark_order_paid_grant.sql.
--
-- 033 tied delivery to category: a "CFX Scripts" or "MLOs" listing could only
-- ever be a manual cfx.re transfer, with no file or Drive option. That was
-- too rigid — an MLO is just as often something already held as a file or
-- Drive link, revealed instantly on purchase like any other script, and
-- lumping it in with genuine cfx.re transfers gave buyers the wrong idea
-- about how it's delivered.
--
-- Category and delivery are now independent. Category (Cars, Custom Build
-- Scripts, CFX Scripts, MLOs) is only ever a label for browsing. Delivery —
-- a hosted file, a Drive link, or a manual cfx.re transfer — is picked per
-- listing and decided purely by which of file_path / drive_url / cfx_details
-- is actually filled in, the same way list_scripts() and downloads_for_order()
-- already compute it. This migration removes the category restriction
-- everywhere else still had it.

-- ---------------------------------------------------------------------------
-- A listing may go on sale with a file, a Drive link, or a cfx.re reference
-- note — any category, any of the three, no longer gated on which category.
-- ---------------------------------------------------------------------------

alter table public.script_products
  drop constraint if exists script_has_a_delivery_route;

alter table public.script_products
  add constraint script_has_a_delivery_route
    check (
      not active
      or file_path is not null
      or drive_url is not null
      or coalesce(trim(cfx_details), '') <> ''
    );

-- ---------------------------------------------------------------------------
-- The storefront's filter drops the category check — a listing is buyable
-- the moment it has any of the three routes, whatever category it's filed
-- under. The delivery case statement itself was already category-free.
-- ---------------------------------------------------------------------------

drop function if exists public.list_scripts();

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
  sales_count integer,
  image_path  text,
  delivery    text,
  category    text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.slug, s.name, s.summary, s.description, s.platform, s.version,
         s.price_cents, s.file_bytes, s.sales_count, s.image_path,
         case
           when s.file_path is not null then 'file'
           when s.drive_url is not null then 'drive'
           else 'cfx'
         end,
         s.category
  from public.script_products s
  where s.active
    and (
      s.file_path is not null
      or s.drive_url is not null
      or coalesce(trim(s.cfx_details), '') <> ''
    )
  order by s.sales_count desc, s.created_at desc;
$$;

revoke all on function public.list_scripts() from public;
grant execute on function public.list_scripts() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pricing gains the same category-free check. Everything else in this
-- function is 033's version reproduced verbatim.
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

      -- Three delivery routes are enough to sell: a hosted file, a Drive
      -- link, or a cfx.re reference note for a manual transfer — any of the
      -- three, on any category. Mirrors script_has_a_delivery_route above.
      select * into v_script
      from public.script_products
      where lower(slug) = lower(substring(v_sku from 8))
        and active
        and (
          file_path is not null
          or drive_url is not null
          or coalesce(trim(cfx_details), '') <> ''
        );

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
-- Whether paying for a script pulls the listing and creates a "needs a
-- manual transfer" project is now decided by delivery, not category: a
-- listing with no file and no Drive link — i.e. cfx.re is the only route —
-- behaves as a one-off, whatever category it's filed under. Everything else
-- in this function is 033's version reproduced verbatim.
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
  o           public.orders;
  v_project   text;
  v_summary   text;
  v_line      jsonb;
  v_script    record;
  v_scripts   int := 0;
  v_other     int := 0;
  v_cfx_names text;
  v_cfx_count int := 0;
  v_details   text;
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

        -- A cfx.re-delivered licence is sold once. Pull it, and note it so a
        -- developer knows a manual transfer is owed. Decided by delivery —
        -- no file and no Drive link means cfx.re is the only route this
        -- listing has — not by category.
        if v_script.file_path is null
           and v_script.drive_url is null
           and coalesce(trim(v_script.cfx_details), '') <> '' then
          update public.script_products
             set active     = false,
                 sold_at    = now(),
                 updated_at = now()
           where id = v_script.id;

          v_cfx_count := v_cfx_count + 1;
          v_cfx_names := coalesce(v_cfx_names || ', ', '') || v_script.name;
        end if;
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

  -- A pure file/Drive script order is a download, not a job — it should not
  -- clutter Pending Projects with something that needs no work doing. A cfx
  -- one is the opposite: nothing happens until a developer does the transfer
  -- by hand, so it always needs a project.
  if v_other > 0 or v_cfx_count > 0 then
    v_details :=
      coalesce(v_summary, 'Order') || ' — paid ' ||
      to_char((o.total_cents / 100.0), 'FM999999990.00') || ' AUD';

    if v_cfx_count > 0 then
      v_details := v_details ||
        E'\n\nCFX asset transfer needed — please complete via your cfx.re ' ||
        'assets account and allow up to 30 minutes.' ||
        case when o.buyer_note is not null then E'\n' || o.buyer_note else '' end;
    end if;

    insert into public.projects (
      status, service, client_name, client_email, details, order_kind, amount_cents
    )
    values (
      'pending',
      case when v_cfx_count > 0 then 'CFX Transfer — ' || coalesce(v_cfx_names, v_summary)
           else coalesce(v_summary, 'Paid order') end,
      o.customer_name,
      o.customer_email,
      v_details,
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
revoke execute on function public.mark_order_paid(uuid, text) from authenticated;
