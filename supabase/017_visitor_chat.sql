-- DigiCode — live chat for site visitors.
-- Run this once in the Supabase SQL Editor, after 016_client_project_review.sql.
--
-- A visitor on the public site is not signed in and never will be, so none of
-- the usual RLS-on-auth.jwt() patterns apply. Instead each conversation gets a
-- random token which the browser keeps in localStorage. That token is the only
-- thing that proves "this is my conversation", so:
--
--   * both tables have RLS on with NO policies for anon — the anon key cannot
--     touch a single row directly, in either direction;
--   * everything a visitor does goes through the three SECURITY DEFINER
--     functions at the bottom, each of which takes the token and can only ever
--     reach the one conversation it belongs to;
--   * devs read and reply through normal RLS, because they *are* signed in.
--
-- The token is a v4 uuid (122 bits of randomness), so it is not guessable.
-- Losing it means losing the thread, which is the correct failure mode for an
-- anonymous chat — there is nothing to recover it with, and nothing sensitive
-- is stored against it beyond what the visitor typed.

create table public.visitor_chats (
  id               bigint generated always as identity primary key,
  token            uuid not null default gen_random_uuid(),
  visitor_name     text,
  visitor_email    text,
  first_page       text,
  status           text not null default 'open' check (status in ('open', 'closed')),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  last_notified_at timestamptz
);

create unique index visitor_chats_token_idx on public.visitor_chats (token);
create index visitor_chats_recent_idx on public.visitor_chats (last_message_at desc);

create table public.visitor_messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint not null references public.visitor_chats (id) on delete cascade,
  sender          text not null check (sender in ('visitor', 'dev')),
  sender_name     text,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index visitor_messages_thread_idx on public.visitor_messages (conversation_id, id);

alter table public.visitor_chats enable row level security;
alter table public.visitor_messages enable row level security;

-- Devs see and answer everything. No anon policy exists on purpose.
create policy "Devs can view visitor conversations"
  on public.visitor_chats for select
  using (public.is_dev());

create policy "Devs can update visitor conversations"
  on public.visitor_chats for update
  using (public.is_dev())
  with check (public.is_dev());

create policy "Devs can view visitor messages"
  on public.visitor_messages for select
  using (public.is_dev());

-- A dev can only ever post as a dev — they cannot forge a message from the
-- visitor's side of the thread.
create policy "Devs can reply to visitors"
  on public.visitor_messages for insert
  with check (public.is_dev() and sender = 'dev');


-- ---------------------------------------------------------------------------
-- Visitor-side API. Three functions, all token-scoped.
-- ---------------------------------------------------------------------------

-- Opens a conversation and hands back the token that addresses it.
create or replace function public.visitor_chat_start(
  p_name  text default null,
  p_email text default null,
  p_page  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid;
begin
  insert into public.visitor_chats (visitor_name, visitor_email, first_page)
  values (
    nullif(left(trim(coalesce(p_name, '')), 80), ''),
    nullif(left(trim(coalesce(p_email, '')), 160), ''),
    nullif(left(trim(coalesce(p_page, '')), 300), '')
  )
  returning token into new_token;

  return new_token;
end;
$$;

-- Appends a visitor message. Caps length, and refuses to let one conversation
-- be used as a firehose — 20 messages a minute is far past human typing speed,
-- so anything above it is a script.
create or replace function public.visitor_chat_send(
  p_token uuid,
  p_body  text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  convo    public.visitor_chats%rowtype;
  clean    text;
  recent   int;
  new_id   bigint;
begin
  select * into convo from public.visitor_chats where token = p_token;
  if not found then
    raise exception 'unknown conversation';
  end if;

  clean := left(trim(coalesce(p_body, '')), 2000);
  if clean = '' then
    raise exception 'empty message';
  end if;

  select count(*) into recent
  from public.visitor_messages
  where conversation_id = convo.id
    and sender = 'visitor'
    and created_at > now() - interval '1 minute';

  if recent >= 20 then
    raise exception 'too many messages, slow down';
  end if;

  insert into public.visitor_messages (conversation_id, sender, sender_name, body)
  values (convo.id, 'visitor', convo.visitor_name, clean)
  returning id into new_id;

  update public.visitor_chats
     set last_message_at = now(),
         status = 'open'
   where id = convo.id;

  return new_id;
end;
$$;

-- Returns everything in this one thread after p_after. The visitor polls this;
-- it can never reach a conversation other than the one its token names.
create or replace function public.visitor_chat_poll(
  p_token uuid,
  p_after bigint default 0
)
returns table (
  id          bigint,
  sender      text,
  sender_name text,
  body        text,
  created_at  timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.sender, m.sender_name, m.body, m.created_at
  from public.visitor_messages m
  join public.visitor_chats c on c.id = m.conversation_id
  where c.token = p_token
    and m.id > coalesce(p_after, 0)
  order by m.id
  limit 200;
$$;

-- Lets the visitor fill in their name/email after the fact, without being able
-- to touch anything else on the row.
create or replace function public.visitor_chat_identify(
  p_token uuid,
  p_name  text default null,
  p_email text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.visitor_chats
     set visitor_name  = coalesce(nullif(left(trim(coalesce(p_name, '')), 80), ''), visitor_name),
         visitor_email = coalesce(nullif(left(trim(coalesce(p_email, '')), 160), ''), visitor_email)
   where token = p_token;
$$;

revoke all on function public.visitor_chat_start(text, text, text) from public;
revoke all on function public.visitor_chat_send(uuid, text) from public;
revoke all on function public.visitor_chat_poll(uuid, bigint) from public;
revoke all on function public.visitor_chat_identify(uuid, text, text) from public;

grant execute on function public.visitor_chat_start(text, text, text) to anon, authenticated;
grant execute on function public.visitor_chat_send(uuid, text) to anon, authenticated;
grant execute on function public.visitor_chat_poll(uuid, bigint) to anon, authenticated;
grant execute on function public.visitor_chat_identify(uuid, text, text) to anon, authenticated;

-- So the portal can stream new messages in live rather than polling.
alter publication supabase_realtime add table public.visitor_messages;
alter publication supabase_realtime add table public.visitor_chats;
