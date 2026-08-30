-- DigiCode — restrict who can change the developer roster, and tighten two
-- permission-check functions.
-- Run this once in the Supabase SQL Editor, after 020_discount_codes.sql.
--
-- WHY THIS MATTERS NOW: 002 gave every developer full write access to the
-- roster:
--
--     create policy "Devs can manage the developer roster"
--       on public.developers for all using (public.is_dev());
--
-- When ranks were only labels that was untidy. It isn't any more — permissions
-- now gate deleting live chat history and managing discount codes, so under
-- that policy the most junior account could promote itself to Lead Developer,
-- tick every box, and let itself do both. This replaces it: everyone on the
-- roster can still SEE it, but only the accounts below can change it.
--
--   * rank 'Lead Developer', or
--   * the 'Manage Developers' permission, or
--   * a signed-in dev who isn't on the roster — the owner account, which must
--     never be able to lock itself out.
--
-- That last clause is also the recovery path: if the roster is ever emptied or
-- an account is removed by mistake, the owner still gets in.

create or replace function public.can_manage_developers()
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
           and (rank = 'Lead Developer' or permissions ? 'Manage Developers')
       )
     );
$$;

revoke all on function public.can_manage_developers() from public;
revoke execute on function public.can_manage_developers() from anon;
grant execute on function public.can_manage_developers() to authenticated;

-- Out with the blanket write policy.
drop policy if exists "Devs can manage the developer roster" on public.developers;

-- The select policy from 002 stays: every dev can still read the roster, which
-- the portal needs to render names, ranks and the chat list.
create policy "Permitted devs can add developers"
  on public.developers for insert
  with check (public.can_manage_developers());

create policy "Permitted devs can edit developers"
  on public.developers for update
  using (public.can_manage_developers())
  with check (public.can_manage_developers());

create policy "Permitted devs can remove developers"
  on public.developers for delete
  using (public.can_manage_developers());


-- ---------------------------------------------------------------------------
-- Hygiene on the two checks added in 019 and 020.
--
-- Supabase grants EXECUTE on new public-schema functions to `anon` by default,
-- and `revoke ... from public` does not undo an explicit grant to that role —
-- so both were callable by anonymous visitors. They only ever returned false
-- to anon and leaked nothing, but they were looser than intended.
-- ---------------------------------------------------------------------------

revoke execute on function public.can_delete_visitor_chats() from anon;
revoke execute on function public.can_manage_discount_codes() from anon;
