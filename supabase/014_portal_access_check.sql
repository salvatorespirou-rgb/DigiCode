-- DigiCode — Phase 2c: gate portal sign-in to devs and real customers.
-- Run this once in the Supabase SQL Editor, after 013_daily_quests.sql.
--
-- Before this, the sign-in page happily mailed a one-time code to ANY email
-- typed into it, because `signInWithOtp` was called with no check at all.
-- The portal should only be reachable by two kinds of people:
--   * someone on the developer roster, and
--   * someone who has actually bought something (their email is on a project).
--
-- The check can't be done from the browser directly: `developers` and
-- `projects` both have RLS, and their policies require you to already be
-- signed in — which a visitor at the sign-in page obviously isn't. So this
-- is a SECURITY DEFINER function that runs with the owner's rights, takes an
-- email, and returns nothing but a yes/no. No row data ever leaves it.
--
-- Note this is deliberately callable by `anon` — it has to be, to gate the
-- sign-in form. That does mean someone could use it to probe whether a given
-- address has portal access. That's inherent to the requested behaviour
-- ("tell them the email has no access"), and the payoff is that we no longer
-- send real login codes to strangers. It leaks nothing beyond that boolean.

create or replace function public.email_has_portal_access(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
           select 1 from public.developers
           where lower(email) = lower(trim(check_email))
         )
      or exists (
           select 1 from public.projects
           where lower(client_email) = lower(trim(check_email))
         );
$$;

revoke all on function public.email_has_portal_access(text) from public;
grant execute on function public.email_has_portal_access(text) to anon, authenticated;
