-- DigiCode — thumbnails for script listings
-- Run this in the Supabase SQL Editor after 027_script_store.sql.
--
-- Note this is a SECOND bucket, public, separate from script-files. The zip a
-- customer pays for must never be readable without a purchase; the picture on
-- the store card has to be readable by everyone who visits the page. Same
-- feature, opposite requirements, so they cannot share a bucket.

alter table public.script_products
  add column if not exists image_path text;

-- ---------------------------------------------------------------------------
-- Public bucket, images only, small
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'script-images',
  'script-images',
  true,                                     -- readable by anyone: it is a shop photo
  5242880,                                  -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look; only a script manager may put one there or remove it.
drop policy if exists "Script images are publicly readable" on storage.objects;
create policy "Script images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'script-images');

drop policy if exists "Script managers can upload images" on storage.objects;
create policy "Script managers can upload images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'script-images' and public.can_manage_scripts());

drop policy if exists "Script managers can replace images" on storage.objects;
create policy "Script managers can replace images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'script-images' and public.can_manage_scripts());

drop policy if exists "Script managers can remove images" on storage.objects;
create policy "Script managers can remove images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'script-images' and public.can_manage_scripts());

-- ---------------------------------------------------------------------------
-- The storefront needs the image path. Still no file_path — that stays hidden.
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
  image_path  text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.slug, s.name, s.summary, s.description, s.platform, s.version,
         s.price_cents, s.file_bytes, s.sales_count, s.image_path
  from public.script_products s
  where s.active and s.file_path is not null
  order by s.sales_count desc, s.created_at desc;
$$;

revoke all on function public.list_scripts() from public;
grant execute on function public.list_scripts() to anon, authenticated;
