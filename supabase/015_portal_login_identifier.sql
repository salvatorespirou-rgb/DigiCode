-- DigiCode — Phase 2d: sign in with a username or an email, and with a password.
-- Run this once in the Supabase SQL Editor, after 014_portal_access_check.sql.
--
-- Two things needed this:
--
--  * Developers are added to the roster with a username, and should be able to
--    sign in with it rather than having to remember which email the account
--    was set up under.
--  * Signing in is moving to a real password. Supabase's signInWithPassword
--    only takes an email, so whatever someone types has to be turned into the
--    email on their account before we can call it.
--
-- Same reason as 014 for this being a SECURITY DEFINER function: `developers`
-- and `projects` are behind RLS that requires an existing session, and the
-- person at the sign-in page hasn't got one yet.
--
-- Exact email wins over a username match, which in turn wins over a client
-- email, so a username that happens to equal somebody else's email address
-- can't hijack their account.
--
-- Worth being clear about the trade-off: this maps a username to an email
-- address for anyone who asks, which is the usual cost of offering username
-- login on a client-only stack. It returns nothing else, and it stays limited
-- to people who already have portal access.

create or replace function public.resolve_portal_login(identifier text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email from (
    select email, 1 as priority
      from public.developers
     where lower(email) = lower(trim(identifier))
    union all
    select email, 2
      from public.developers
     where username is not null
       and lower(username) = lower(trim(identifier))
    union all
    select client_email, 3
      from public.projects
     where client_email is not null
       and lower(client_email) = lower(trim(identifier))
  ) matches
  order by priority
  limit 1;
$$;

revoke all on function public.resolve_portal_login(text) from public;
grant execute on function public.resolve_portal_login(text) to anon, authenticated;
