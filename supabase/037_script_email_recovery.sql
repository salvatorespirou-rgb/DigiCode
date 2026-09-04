-- DigiCode — a place to log link-recovery requests, so the recovery endpoint
-- can rate-limit itself
-- Run this in the Supabase SQL Editor after 036_script_sales.sql.
--
-- The recovery endpoint (resend-script-links Edge Function) lets anyone type
-- in an email address and asks it to re-send whatever Drive links are tied
-- to it. Nothing about that is secret — the response is identical whether or
-- not anything was found, same rule as invoice_for_payment — but without a
-- cooldown it would happily let someone use the store as a mail cannon
-- against an address that isn't theirs. This table is that cooldown.
--
-- Service-role only: no anon or authenticated policy at all. Only the Edge
-- Function, using the service role key, ever reads or writes it.

create table if not exists public.script_link_resend_log (
  email             text primary key,
  last_requested_at timestamptz not null default now(),
  request_count     integer not null default 1
);

alter table public.script_link_resend_log enable row level security;
-- No policies. RLS enabled with none defined blocks every role except the
-- service role, which bypasses RLS entirely — exactly the access this needs.
