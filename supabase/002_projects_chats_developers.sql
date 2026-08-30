-- DigiCode — Phase 2: real Dev pipeline (projects, chat, developer roster)
-- Run this once in the Supabase SQL Editor, after 001_profiles.sql.

create extension if not exists pgcrypto;

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  client_name text,
  client_email text,
  service text,
  build_tier text,
  management_tier text,
  billing text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'finished')),
  assigned_dev text,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  domain text,
  health jsonb,
  form_lines jsonb not null default '[]'::jsonb,
  progress_notes jsonb not null default '[]'::jsonb
);

alter table public.projects enable row level security;

-- A client sees only projects placed under the email they're signed in with.
create policy "Clients can view their own projects"
  on public.projects for select
  using (client_email = (auth.jwt() ->> 'email'));

create policy "Devs can view all projects"
  on public.projects for select
  using (public.is_dev());

-- Checkout runs without being signed in, so anyone can create a project —
-- but only ever as a fresh pending, unassigned one. Nothing else can be set.
create policy "Anyone can submit a new pending project"
  on public.projects for insert
  with check (status = 'pending' and assigned_dev is null and finished_at is null);

create policy "Devs can update projects"
  on public.projects for update
  using (public.is_dev());


create table public.chats (
  id bigint generated always as identity primary key,
  chat_id text not null,
  from_name text not null,
  from_email text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.chats enable row level security;

create policy "Devs can view all chats"
  on public.chats for select
  using (public.is_dev());

create policy "Devs can send chats"
  on public.chats for insert
  with check (public.is_dev());

create policy "Clients can view chats on their own projects"
  on public.chats for select
  using (
    chat_id in (select 'client:' || id from public.projects where client_email = (auth.jwt() ->> 'email'))
  );

create policy "Clients can send chats on their own projects"
  on public.chats for insert
  with check (
    chat_id in (select 'client:' || id from public.projects where client_email = (auth.jwt() ->> 'email'))
  );


create table public.developers (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  rank text,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.developers enable row level security;

create policy "Devs can view the developer roster"
  on public.developers for select
  using (public.is_dev());

create policy "Devs can manage the developer roster"
  on public.developers for all
  using (public.is_dev())
  with check (public.is_dev());
