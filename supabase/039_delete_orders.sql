-- DigiCode — removing an order from the Orders tab
-- Run this in the Supabase SQL Editor after 038_order_session_and_recovery.sql.
--
-- The Orders tab lists every checkout ever started, which means it also lists
-- every abandoned one and every test run. Those pile up and bury the thing the
-- tab exists for: a real payment that hasn't been confirmed. So there needs to
-- be a way to throw a row away.
--
-- orders has RLS on with no delete policy, so nobody can delete a row today —
-- not even a lead developer. Rather than open a delete policy on the table
-- (which would make it that little bit easier to lose a real order to a stray
-- query), this goes through one function that decides what is safe to remove.
--
-- Two rules it enforces:
--
--   * Only the people who may delete a project may delete an order — same
--     gate, same reasoning. Cheap to keep, expensive to have wrong.
--   * A paid order is never removed by accident. It is the money trail for a
--     real customer, and if that customer bought a script, deleting the order
--     also deletes the record their download link is issued against. That
--     takes a deliberate second confirmation, and the function reports what it
--     destroyed so the caller can say so out loud.

-- ---------------------------------------------------------------------------
-- delete_order — remove one checkout, and anything that only existed for it
--
-- Returns what it deleted:
--   {"deleted": true, "was_paid": false, "purchases_removed": 0,
--    "reference": "..."}
--
-- A project created from a paid order is deliberately left alone. It has its
-- own card, its own delete button and its own permission check, and quietly
-- removing someone's job because an order row was tidied up would be a nasty
-- surprise.
-- ---------------------------------------------------------------------------

create or replace function public.delete_order(
  p_reference uuid,
  p_force     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order     public.orders%rowtype;
  v_purchases integer := 0;
begin
  if not public.can_remove_projects() then
    raise exception 'not allowed';
  end if;

  select * into v_order from public.orders where reference = p_reference;

  if not found then
    -- Already gone. Say so plainly rather than failing — two clicks on the
    -- same button shouldn't look like a broken portal.
    return jsonb_build_object(
      'deleted', false,
      'reason', 'not_found',
      'reference', p_reference
    );
  end if;

  if v_order.status = 'paid' and not p_force then
    raise exception 'paid order requires confirmation';
  end if;

  -- Script purchases exist only to back a download link for this order. With
  -- the order gone the link can't be looked up or recovered anyway, so leaving
  -- them behind would just be a row that lies about what the buyer still has.
  delete from public.script_purchases where order_reference = p_reference;
  get diagnostics v_purchases = row_count;

  delete from public.orders where reference = p_reference;

  return jsonb_build_object(
    'deleted', true,
    'was_paid', v_order.status = 'paid',
    'purchases_removed', v_purchases,
    'reference', p_reference
  );
end;
$$;

revoke all on function public.delete_order(uuid, boolean) from public;
revoke execute on function public.delete_order(uuid, boolean) from anon;
grant execute on function public.delete_order(uuid, boolean) to authenticated;
