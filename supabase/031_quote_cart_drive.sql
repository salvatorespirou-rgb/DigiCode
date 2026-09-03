-- DigiCode — let a Drive-delivered script be bought.
--
-- 030 taught list_scripts(), redeem_download() and downloads_for_order() that a
-- script can be delivered by a Google Drive link instead of a hosted file, but
-- quote_cart() was left behind still requiring file_path. The result was a
-- storefront that happily showed the listing and a checkout that answered
-- "unknown item" — the cart fell through to its email fallback and the buyer
-- never reached Stripe.
--
-- The only change below is that one WHERE clause. Everything else is 027's
-- function reproduced verbatim so this stays a single replace.
--
-- Run in the Supabase SQL editor.

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

      -- Either delivery route is enough to sell: a hosted file or a Drive
      -- link. This mirrors the script_has_a_delivery_route constraint added
      -- in 030, which is what actually guarantees an active listing has one.
      select * into v_script
      from public.script_products
      where lower(slug) = lower(substring(v_sku from 8))
        and active
        and (file_path is not null or drive_url is not null);

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
