-- DigiCode — tell a paid order apart from a quote request
-- Run this in the Supabase SQL Editor after 024_project_uploads.sql.
--
-- Pending Projects had no way to show whether money had actually changed
-- hands. A card that has been paid for needs starting; a quote request needs
-- pricing and a reply first. Same list, opposite next action.

alter table public.projects
  add column if not exists order_kind text not null default 'enquiry'
    check (order_kind in ('paid', 'quote', 'enquiry'));

alter table public.projects
  add column if not exists amount_cents integer;

comment on column public.projects.order_kind is
  'paid = card payment completed via Stripe; quote = client asked us to price '
  'something outside the fixed packages; enquiry = form sent without payment.';

-- Anything already in the table pre-dates card payments, so it is an enquiry —
-- which is what the default gives it. Nothing to backfill.

-- ---------------------------------------------------------------------------
-- A paid order should say so, and carry what was actually paid.
-- ---------------------------------------------------------------------------

create or replace function public.mark_order_paid(
  p_reference uuid,
  p_session   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders;
  v_project  text;
  v_summary  text;
begin
  select * into o from public.orders where reference = p_reference for update;
  if not found then
    raise exception 'unknown order';
  end if;

  if o.status = 'paid' then
    return;                       -- already handled; webhook retry
  end if;

  select string_agg(
           (l ->> 'name') || case when (l ->> 'qty')::int > 1
                                  then ' x' || (l ->> 'qty') else '' end,
           ' · ')
    into v_summary
  from jsonb_array_elements(o.items) l;

  insert into public.projects (
    status, service, client_name, client_email, details, order_kind, amount_cents
  )
  values (
    'pending',
    coalesce(v_summary, 'Paid order'),
    o.customer_name,
    o.customer_email,
    coalesce(v_summary, 'Order') || ' — paid ' ||
      to_char((o.total_cents / 100.0), 'FM999999990.00') || ' AUD',
    'paid',
    o.total_cents
  )
  returning id into v_project;

  update public.orders
     set status            = 'paid',
         paid_at           = now(),
         stripe_session_id = coalesce(p_session, stripe_session_id),
         project_id        = v_project
   where id = o.id;

  if o.discount_code is not null then
    perform public.redeem_discount_code(o.discount_code);
  end if;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text) from public;
revoke execute on function public.mark_order_paid(uuid, text) from anon;

-- ---------------------------------------------------------------------------
-- Quote requests. Anon-callable, because nobody is signed in when they ask.
-- ---------------------------------------------------------------------------

create or replace function public.request_quote(
  p_service text,
  p_name    text,
  p_email   text,
  p_details text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  -- Light throttle: a real person does not file six quote requests a minute.
  select count(*) into recent
  from public.projects
  where order_kind = 'quote' and created_at > now() - interval '1 minute';
  if recent >= 6 then
    return;
  end if;

  insert into public.projects (status, service, client_name, client_email, details, order_kind)
  values (
    'pending',
    left(coalesce(nullif(trim(p_service), ''), 'Custom quote'), 120),
    left(coalesce(p_name, ''), 120),
    left(coalesce(p_email, ''), 200),
    left(coalesce(p_details, 'No details provided.'), 8000),
    'quote'
  );
end;
$$;

revoke all on function public.request_quote(text, text, text, text) from public;
grant execute on function public.request_quote(text, text, text, text) to anon, authenticated;
