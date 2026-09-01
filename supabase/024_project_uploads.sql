-- DigiCode — client file uploads from the request forms
-- Run this in the Supabase SQL Editor after 023_stripe_checkout.sql.
--
-- Lets someone attach their logo, photos, brand guidelines or a content
-- document to an enquiry. A visitor may only ever WRITE: they cannot list the
-- bucket, read anything back, overwrite, or delete. So one client can never
-- reach another client's files, and the bucket is not a public file host.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-uploads',
  'project-uploads',
  false,                                   -- never publicly listable
  10485760,                                -- 10 MB per file
  array[
    'image/png','image/jpeg','image/gif','image/webp','image/svg+xml',
    'application/pdf','application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can attach a file to an enquiry" on storage.objects;
create policy "Anyone can attach a file to an enquiry"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'project-uploads');

-- Deliberately no select/update/delete policy for anon: uploads are one-way.
drop policy if exists "Devs can read project uploads" on storage.objects;
create policy "Devs can read project uploads"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'project-uploads' and public.is_dev());

drop policy if exists "Devs can remove project uploads" on storage.objects;
create policy "Devs can remove project uploads"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-uploads' and public.is_dev());

-- ---------------------------------------------------------------------------
-- An index of what was uploaded, so the dev portal can show the files against
-- an enquiry without having to trawl the bucket.
-- ---------------------------------------------------------------------------

create table if not exists public.project_uploads (
  id          bigint generated always as identity primary key,
  batch       uuid not null,               -- one enquiry's worth of files
  service     text,
  file_path   text not null,
  file_name   text not null,
  size_bytes  bigint,
  mime_type   text,
  created_at  timestamptz not null default now()
);

create index if not exists project_uploads_batch_idx on public.project_uploads (batch);
create index if not exists project_uploads_created_idx on public.project_uploads (created_at desc);

alter table public.project_uploads enable row level security;

drop policy if exists "Devs can view uploads" on public.project_uploads;
create policy "Devs can view uploads"
  on public.project_uploads for select
  using (public.is_dev());

-- Visitors record their upload through this, not by writing the table, so the
-- columns cannot be forged into something misleading.
create or replace function public.record_upload(
  p_batch uuid,
  p_service text,
  p_path text,
  p_name text,
  p_size bigint,
  p_mime text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  if p_batch is null or coalesce(trim(p_path), '') = '' then
    return;
  end if;

  -- A person attaching files to one enquiry does not need more than this.
  select count(*) into recent
  from public.project_uploads
  where batch = p_batch;
  if recent >= 20 then
    return;
  end if;

  insert into public.project_uploads (batch, service, file_path, file_name, size_bytes, mime_type)
  values (
    p_batch,
    left(coalesce(p_service, ''), 80),
    left(p_path, 400),
    left(coalesce(p_name, 'file'), 200),
    greatest(0, coalesce(p_size, 0)),
    left(coalesce(p_mime, ''), 100)
  );
end;
$$;

revoke all on function public.record_upload(uuid, text, text, text, bigint, text) from public;
grant execute on function public.record_upload(uuid, text, text, text, bigint, text) to anon, authenticated;
