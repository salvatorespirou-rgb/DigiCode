-- DigiCode — let trusted devs clear out old live-chat conversations.
-- Run this once in the Supabase SQL Editor, after 018_visitor_chat_email.sql.
--
-- Deleting is deliberately narrower than reading. Every dev can see and answer
-- visitor chats; only these can remove them:
--
--   * anyone whose rank on the developer roster is 'Lead Developer', and
--   * anyone granted the 'Delete Live Chats' permission in the portal, and
--   * a signed-in dev who isn't on the roster at all — that's the owner
--     account the roster was created from, and locking it out of its own data
--     would be a good way to end up with no way back in.
--
-- The check is a function rather than inline SQL so both policies share one
-- definition and there's a single place to change the rule.

create or replace function public.can_delete_visitor_chats()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_dev()
     and (
       not exists (
         select 1 from public.developers
         where lower(email) = lower(auth.jwt() ->> 'email')
       )
       or exists (
         select 1 from public.developers
         where lower(email) = lower(auth.jwt() ->> 'email')
           and (rank = 'Lead Developer' or permissions ? 'Delete Live Chats')
       )
     );
$$;

revoke all on function public.can_delete_visitor_chats() from public;
grant execute on function public.can_delete_visitor_chats() to authenticated;

-- Removing the conversation takes its messages with it (the foreign key in 017
-- is ON DELETE CASCADE), so the row-level policy on messages only matters for
-- deleting an individual message out of a thread.
create policy "Permitted devs can delete visitor conversations"
  on public.visitor_chats for delete
  using (public.can_delete_visitor_chats());

create policy "Permitted devs can delete visitor messages"
  on public.visitor_messages for delete
  using (public.can_delete_visitor_chats());
