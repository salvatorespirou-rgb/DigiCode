-- DigiCode — make an unpaid order recoverable without the webhook
-- Run this in the Supabase SQL Editor after 037_script_email_recovery.sql.
--
-- Why this exists: the Stripe webhook was the only thing that could ever mark
-- an order paid, and its signature check was failing. Sixteen orders, not one
-- marked paid, no download for the buyers, nothing in the portal, and no sign
-- anything was wrong until a customer complained. The signing secret is one
-- fix; this is the other half — so that a webhook that breaks again cannot
-- silently swallow a sale.
--
-- stripe_session_id is only written by mark_order_paid, i.e. after payment
-- succeeds, which is useless for asking Stripe "was this ever actually paid?"
-- about an order stuck pending. checkout_session_id is stamped the moment the
-- Checkout Session is created, so an order can always be traced back to
-- Stripe and re-checked — by the success page (confirm-order), or by hand
-- from the portal.

alter table public.orders
  add column if not exists checkout_session_id text;

create index if not exists orders_checkout_session_idx
  on public.orders (checkout_session_id)
  where checkout_session_id is not null;

comment on column public.orders.checkout_session_id is
  'Stripe Checkout Session id, stamped at creation — before payment. Lets an '
  'order stuck pending be re-checked against Stripe. stripe_session_id, by '
  'contrast, is only written once the payment is confirmed.';

-- Orders already carry a "Devs can view orders" select policy from 023, so
-- the portal can read this straight from the table — no new function needed.
