-- DigiCode — close a free-goods hole in mark_order_paid
-- Run this in the Supabase SQL Editor after 033_cfx_scripts.sql.
--
-- Found while double-checking the CFX Scripts work: mark_order_paid() is
-- meant to be callable only by the Stripe webhook, running as the service
-- role. Every migration that touched it (023, 025, 027, 033) revoked EXECUTE
-- from anon and from public, but never from authenticated — so any
-- signed-in portal account could call it directly over the RPC endpoint and
-- mark any pending order paid without Stripe ever being charged, granting
-- themselves a real download token for any script and, for a CFX Scripts /
-- MLOs listing, pulling it from the store as though it had genuinely sold.
--
-- mark_invoice_paid(), added in 032, already revokes execute from
-- authenticated — this brings mark_order_paid() in line with it. Nothing in
-- the browser ever calls mark_order_paid directly (only the webhook, using
-- the service role key), so this closes the hole with no behaviour change
-- for anyone using the site normally.

revoke execute on function public.mark_order_paid(uuid, text) from authenticated;
