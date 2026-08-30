-- DigiCode — Phase 1: real auth (profiles table + row-level security)
-- Run this once in the Supabase SQL Editor for this project.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'client' check (role in ('client', 'dev')),
  name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Lets a policy check "is this user a dev" without RLS recursing into itself.
create or replace function public.is_dev()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dev'
  );
$$;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Devs can view all profiles"
  on public.profiles for select
  using (public.is_dev());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Every new signup automatically gets a profile row (role defaults to 'client').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
