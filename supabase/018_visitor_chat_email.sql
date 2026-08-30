-- DigiCode — email notification when a site visitor starts chatting.
-- Run this once in the Supabase SQL Editor, after 017_visitor_chat.sql.
--
-- SETUP — do these three things first, then run this file:
--
--   1. Sign up at https://resend.com with salvatorespirou@gmail.com.
--      The free tier is 3,000 emails a month, which is far more than this
--      will ever use.
--
--   2. Create an API key (Dashboard -> API Keys -> Create). Copy it; it is
--      shown once.
--
--   3. In the Supabase SQL Editor, store the key in Vault so it never sits in
--      a table or in this file:
--
--        select vault.create_secret('re_your_key_here', 'resend_api_key');
--
--      To change it later:
--        select vault.update_secret(
--          (select id from vault.secrets where name = 'resend_api_key'),
--          're_new_key_here'
--        );
--
-- Until step 3 is done this trigger does nothing at all — it checks for the
-- secret and returns quietly if it isn't there. The chat itself works either
-- way; you just won't get the email.
--
-- WHY THIS AND NOT AN EDGE FUNCTION: an Edge Function would need the Supabase
-- CLI, Docker and a deploy step every time it changes. pg_net does the same
-- job from the database, is configured entirely from the SQL editor, and keeps
-- the API key server-side where the browser can never see it.
--
-- ON THE FROM ADDRESS: `onboarding@resend.dev` works immediately with no DNS
-- setup, but Resend will only deliver it to the address that owns the Resend
-- account. That is exactly the case here. Once digicode's domain is verified
-- in Resend, change NOTIFY_FROM below to something like chat@yourdomain.com
-- and it will deliver anywhere.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_dev_of_visitor_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  api_key      text;
  convo        public.visitor_chats%rowtype;
  msg_count    int;
  subject_line text;
  who          text;
  NOTIFY_TO    constant text := 'salvatorespirou@gmail.com';
  NOTIFY_FROM  constant text := 'DigiCode Chat <onboarding@resend.dev>';
begin
  if new.sender <> 'visitor' then
    return new;
  end if;

  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'resend_api_key';

  -- Not configured yet: leave the chat working and say nothing.
  if api_key is null then
    return new;
  end if;

  select * into convo from public.visitor_chats where id = new.conversation_id;

  -- One email per conversation per 5 minutes. Without this, someone typing
  -- six short lines in a row sends six emails.
  if convo.last_notified_at is not null
     and convo.last_notified_at > now() - interval '5 minutes' then
    return new;
  end if;

  select count(*) into msg_count
  from public.visitor_messages
  where conversation_id = convo.id and sender = 'visitor';

  who := coalesce(nullif(convo.visitor_name, ''), 'Someone');

  subject_line := case
    when msg_count <= 1 then who || ' is chatting on DigiCode'
    else who || ' has replied on DigiCode chat'
  end;

  -- Deliberately a nudge, not a transcript. The message itself stays in the
  -- portal: it keeps what visitors type out of an inbox that syncs to a phone,
  -- and it means the reply happens where the thread actually lives.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || api_key,
                 'Content-Type',  'application/json'
               ),
    body    := jsonb_build_object(
                 'from',    NOTIFY_FROM,
                 'to',      jsonb_build_array(NOTIFY_TO),
                 'subject', subject_line,
                 'html',
                   '<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">'
                   || '<h2 style="margin:0 0 6px">' || who || ' is chatting on the site</h2>'
                   || '<p style="margin:0 0 20px;color:#666;font-size:14px">'
                   || 'Started on ' || coalesce(convo.first_page, 'the site')
                   || '. Open the portal to read it and reply.</p>'
                   || '<p style="margin:0"><a href="https://www.digi-code.com.au/portal.html" '
                   || 'style="background:#6d4ee8;color:#fff;padding:11px 20px;border-radius:8px;'
                   || 'text-decoration:none;display:inline-block;font-weight:600">Open the chat</a></p>'
                   || '<p style="margin:20px 0 0;color:#999;font-size:12px">'
                   || 'You won''t be emailed again about this conversation for 5 minutes.</p>'
                   || '</div>'
               )
  );

  update public.visitor_chats
     set last_notified_at = now()
   where id = convo.id;

  return new;
end;
$$;

drop trigger if exists visitor_message_email on public.visitor_messages;

create trigger visitor_message_email
  after insert on public.visitor_messages
  for each row
  execute function public.notify_dev_of_visitor_message();

-- Handy for checking delivery after a test message:
--   select id, created, status_code, content
--   from net._http_response order by id desc limit 5;
