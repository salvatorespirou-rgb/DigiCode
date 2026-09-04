-- DigiCode — a sales ledger for scripts, with cfx.re fulfilment in one place
-- Run this in the Supabase SQL Editor after 035_delivery_independent_of_category.sql.
--
-- Right now the only trace of a script sale is a script_purchases row (for
-- download tokens) and, for a cfx.re-delivered item, a "CFX Transfer — ..."
-- card buried in Pending Projects alongside every build and quote. There's
-- no single place to see what's actually sold, and a lead developer working
-- through cfx.re transfers has to go find each one's card and read its free
-- text to get the buyer's account name.
--
-- This adds a dedicated, permitted-only view of every script sale — name,
-- category, delivery, buyer, and for a cfx.re item the account to send it to
-- and the internal note on which asset that is — plus a way to mark one done
-- so the list says what's still owed rather than everything ever sold.

-- ---------------------------------------------------------------------------
-- When a cfx.re transfer was completed. Null means still owed. Meaningless
-- for a file/Drive sale, which needs no action from anyone.
-- ---------------------------------------------------------------------------

alter table public.script_purchases
  add column if not exists fulfilled_at timestamptz;

-- ---------------------------------------------------------------------------
-- Every sale, for whoever runs the script store. Devs without that
-- permission still see everything else in the portal; this one is
-- deliberately narrower because it's where a buyer's email and (for a cfx.re
-- item) their account name live.
-- ---------------------------------------------------------------------------

create or replace function public.list_script_sales()
returns table (
  purchase_id  bigint,
  script_name  text,
  category     text,
  delivery     text,
  price_cents  integer,
  buyer_email  text,
  cfx_account  text,
  cfx_details  text,
  downloads    integer,
  purchased_at timestamptz,
  fulfilled_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, s.name, s.category,
         case
           when s.file_path is not null then 'file'
           when s.drive_url is not null then 'drive'
           else 'cfx'
         end,
         s.price_cents, p.buyer_email, o.buyer_note, s.cfx_details,
         p.downloads, p.created_at, p.fulfilled_at
  from public.script_purchases p
  join public.script_products s on s.id = p.product_id
  left join public.orders o on o.reference = p.order_reference
  where public.can_manage_scripts()
  order by p.created_at desc;
$$;

revoke all on function public.list_script_sales() from public;
revoke execute on function public.list_script_sales() from anon;
grant execute on function public.list_script_sales() to authenticated;

-- ---------------------------------------------------------------------------
-- Mark a cfx.re transfer as sent. Fine to call on a file/Drive sale too —
-- there's nothing wrong with it, it just has no effect anyone will see.
-- ---------------------------------------------------------------------------

create or replace function public.mark_script_sale_fulfilled(p_purchase_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_scripts() then
    raise exception 'not allowed';
  end if;

  update public.script_purchases
     set fulfilled_at = now()
   where id = p_purchase_id;
end;
$$;

revoke all on function public.mark_script_sale_fulfilled(bigint) from public;
revoke execute on function public.mark_script_sale_fulfilled(bigint) from anon;
grant execute on function public.mark_script_sale_fulfilled(bigint) to authenticated;
