-- DigiCode — deliver a script by Google Drive link instead of an upload
-- Run this in the Supabase SQL Editor after 029_script_upload_types.sql.
--
-- Supabase's Free plan refuses uploads over 50MB, which is a hard stop for a
-- script that ships with textures, sounds or models. So a listing may now be
-- delivered either way: a file we host, or a Drive link we reveal on purchase.
--
-- Be clear about what this does and does not give you. The uploaded-file route
-- hands out a signed URL that dies in five minutes, so a leaked link is worth
-- nothing. A Drive link cannot expire — once a buyer has it they can pass it
-- to anyone, forever, and the only remedy is to replace the link. The link is
-- still kept out of the public product list and only revealed after payment,
-- so it is not published; it just cannot be clawed back afterwards.

alter table public.script_products
  add column if not exists drive_url text;

-- Only accept somewhere the link could plausibly be. Not security — the field
-- is only writable by a script manager — but it stops a typo turning into a
-- broken purchase that has already been paid for.
alter table public.script_products
  drop constraint if exists script_drive_url_is_google;

alter table public.script_products
  add constraint script_drive_url_is_google
    check (
      drive_url is null
      or drive_url ~* '^https://(drive|docs)\.google\.com/'
    );

-- A listing needs one delivery route or the other before it can go on sale.
alter table public.script_products
  drop constraint if exists script_has_a_delivery_route;

alter table public.script_products
  add constraint script_has_a_delivery_route
    check (
      not active
      or file_path is not null
      or drive_url is not null
    );

-- ---------------------------------------------------------------------------
-- The storefront learns HOW it is delivered, never WHERE from.
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
  delivery    text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.slug, s.name, s.summary, s.description, s.platform, s.version,
         s.price_cents, s.file_bytes, s.sales_count, s.image_path,
         case when s.file_path is not null then 'file' else 'drive' end
  from public.script_products s
  where s.active
    and (s.file_path is not null or s.drive_url is not null)
  order by s.sales_count desc, s.created_at desc;
$$;

revoke all on function public.list_scripts() from public;
grant execute on function public.list_scripts() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Redeeming a token now yields whichever route the listing uses. Still only
-- callable by the Edge Function's service role, never a browser.
-- ---------------------------------------------------------------------------

drop function if exists public.redeem_download(uuid);

create or replace function public.redeem_download(p_token uuid)
returns table (file_path text, file_name text, drive_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select p.id as purchase_id, s.file_path, s.file_name, s.drive_url
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
  drive_url := v.drive_url;
  return next;
end;
$$;

revoke all on function public.redeem_download(uuid) from public;
revoke execute on function public.redeem_download(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Downloads listing on the success page needs to know which kind it is, so it
-- can say "Download" or "Open in Google Drive".
-- ---------------------------------------------------------------------------

drop function if exists public.downloads_for_order(uuid);

create or replace function public.downloads_for_order(p_reference uuid)
returns table (token uuid, name text, file_name text, file_bytes bigint, delivery text)
language sql
security definer
set search_path = public
stable
as $$
  select p.token, s.name, s.file_name, s.file_bytes,
         case when s.file_path is not null then 'file' else 'drive' end
  from public.script_purchases p
  join public.script_products s on s.id = p.product_id
  join public.orders o on o.reference = p.order_reference
  where p.order_reference = p_reference
    and o.status = 'paid';
$$;

revoke all on function public.downloads_for_order(uuid) from public;
grant execute on function public.downloads_for_order(uuid) to anon, authenticated;
