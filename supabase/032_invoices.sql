-- DigiCode — pricing a quote and charging for it.
--
-- Until now a quote request landed in Pending Projects and stopped there:
-- there was no way to put a number on it and take the money. This adds the
-- missing half.
--
--   A lead developer prices the quote — line by line, adding whatever extra
--   services the job needs — and saves it as an invoice. Sending it sets a
--   reference that becomes a public pay link, which can go out by email, show
--   up in the client's portal, or both. The client pays through Stripe and the
--   webhook marks the invoice paid.
--
-- Two rules this file exists to enforce:
--
--   * Only someone permitted may price or send. Everyone else can look.
--   * The browser never states a price. It sends the invoice's reference and
--     the server reads the amount out of this table — the same rule
--     quote_cart() follows for the shop, for the same reason.
--
-- Run in the Supabase SQL Editor, after 031.

-- ---------------------------------------------------------------------------
-- Who may price a quote
--
-- Same shape as can_remove_projects() in 026: the Lead Developer, anyone
-- granted the permission, or the owner account that isn't on the roster at
-- all. Pricing work is a money decision, so it is deliberately not "any dev".
-- ---------------------------------------------------------------------------

create or replace function public.can_price_quotes()
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
           and (rank = 'Lead Developer' or permissions ? 'Price Quotes')
       )
     );
$$;

revoke all on function public.can_price_quotes() from public;
revoke execute on function public.can_price_quotes() from anon;
grant execute on function public.can_price_quotes() to authenticated;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table if not exists public.invoices (
  id                bigint generated always as identity primary key,
  reference         uuid not null default gen_random_uuid(),
  project_id        text references public.projects(id) on delete set null,
  client_name       text,
  client_email      text,
  title             text not null default 'Quote',
  -- [{ "description": "...", "qty": 1, "unit_cents": 120000 }, ...]
  lines             jsonb not null default '[]'::jsonb,
  subtotal_cents    integer not null default 0,
  discount_cents    integer not null default 0,
  total_cents       integer not null default 0,
  currency          text not null default 'aud',
  notes             text,
  status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'paid', 'void')),
  -- How it was delivered. Null until it is sent.
  delivery          text check (delivery in ('email', 'portal', 'both')),
  due_at            date,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz,
  paid_at           timestamptz,
  stripe_session_id text
);

create unique index if not exists invoices_reference_idx
  on public.invoices (reference);
create unique index if not exists invoices_session_idx
  on public.invoices (stripe_session_id) where stripe_session_id is not null;
create index if not exists invoices_project_idx on public.invoices (project_id);
create index if not exists invoices_client_idx  on public.invoices (lower(client_email));
create index if not exists invoices_created_idx on public.invoices (created_at desc);

alter table public.invoices enable row level security;

-- Devs see everything, including drafts.
drop policy if exists "Devs can view invoices" on public.invoices;
create policy "Devs can view invoices"
  on public.invoices for select
  using (public.is_dev());

-- A client sees their own, but never a draft — an unfinished price is not
-- something to show someone before it has been decided.
drop policy if exists "Clients can view their sent invoices" on public.invoices;
create policy "Clients can view their sent invoices"
  on public.invoices for select
  using (
    lower(client_email) = lower(auth.jwt() ->> 'email')
    and status in ('sent', 'paid')
  );

-- Writes go through the functions below, which check can_price_quotes(). No
-- direct insert or update policy exists, for anyone.
drop policy if exists "Permitted devs can delete invoices" on public.invoices;
create policy "Permitted devs can delete invoices"
  on public.invoices for delete
  using (public.can_price_quotes());

-- ---------------------------------------------------------------------------
-- price_invoice_lines — the server's own arithmetic
--
-- Given the line items, work out what they come to. Kept separate so both
-- saving and paying run the identical sum, and so the numbers the portal shows
-- are the numbers Stripe will charge.
-- ---------------------------------------------------------------------------

create or replace function public.price_invoice_lines(p_lines jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_line     jsonb;
  v_clean    jsonb := '[]'::jsonb;
  v_desc     text;
  v_qty      integer;
  v_unit     integer;
  v_subtotal bigint := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'an invoice needs at least one line';
  end if;

  if jsonb_array_length(p_lines) > 40 then
    raise exception 'too many lines (40 max)';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_desc := nullif(trim(coalesce(v_line ->> 'description', '')), '');
    if v_desc is null then
      raise exception 'every line needs a description';
    end if;
    v_desc := left(v_desc, 200);

    v_qty := coalesce((v_line ->> 'qty')::int, 1);
    if v_qty < 1 or v_qty > 999 then
      raise exception 'quantity must be between 1 and 999';
    end if;

    v_unit := coalesce((v_line ->> 'unit_cents')::int, -1);
    if v_unit < 0 then
      raise exception 'a price cannot be negative';
    end if;
    -- Stripe will not take a single amount above this, so a bigger number is
    -- a typo rather than a sale.
    if v_unit > 99999999 then
      raise exception 'that price is too large';
    end if;

    v_subtotal := v_subtotal + (v_unit::bigint * v_qty);

    v_clean := v_clean || jsonb_build_object(
      'description', v_desc,
      'qty',         v_qty,
      'unit_cents',  v_unit,
      'line_cents',  v_unit * v_qty
    );
  end loop;

  if v_subtotal > 99999999 then
    raise exception 'that total is too large to charge in one payment';
  end if;

  return jsonb_build_object(
    'lines',          v_clean,
    'subtotal_cents', v_subtotal::int
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- save_invoice — create or update a draft
--
-- Passing p_id null creates; passing an id updates that invoice. A paid
-- invoice is frozen: the money has moved and the record has to keep matching
-- what was charged.
-- ---------------------------------------------------------------------------

create or replace function public.save_invoice(
  p_id             bigint  default null,
  p_project_id     text    default null,
  p_client_name    text    default null,
  p_client_email   text    default null,
  p_title          text    default null,
  p_lines          jsonb   default '[]'::jsonb,
  p_notes          text    default null,
  p_due_at         date    default null,
  p_discount_cents integer default 0
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_priced   jsonb;
  v_subtotal integer;
  v_discount integer;
  v_row      public.invoices;
  v_existing public.invoices;
begin
  if not public.can_price_quotes() then
    raise exception 'not allowed';
  end if;

  v_priced   := public.price_invoice_lines(p_lines);
  v_subtotal := (v_priced ->> 'subtotal_cents')::int;

  v_discount := greatest(0, coalesce(p_discount_cents, 0));
  if v_discount > v_subtotal then
    raise exception 'the discount is larger than the invoice';
  end if;

  if p_id is not null then
    select * into v_existing from public.invoices where id = p_id for update;
    if not found then
      raise exception 'unknown invoice';
    end if;
    if v_existing.status = 'paid' then
      raise exception 'that invoice has been paid and can no longer be changed';
    end if;

    update public.invoices
       set project_id     = p_project_id,
           client_name    = nullif(trim(coalesce(p_client_name, '')), ''),
           client_email   = nullif(trim(coalesce(p_client_email, '')), ''),
           title          = coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Quote'),
           lines          = v_priced -> 'lines',
           subtotal_cents = v_subtotal,
           discount_cents = v_discount,
           total_cents    = v_subtotal - v_discount,
           notes          = nullif(trim(coalesce(p_notes, '')), ''),
           due_at         = p_due_at,
           updated_at     = now()
     where id = p_id
    returning * into v_row;
  else
    insert into public.invoices (
      project_id, client_name, client_email, title, lines,
      subtotal_cents, discount_cents, total_cents, notes, due_at, created_by
    ) values (
      p_project_id,
      nullif(trim(coalesce(p_client_name, '')), ''),
      nullif(trim(coalesce(p_client_email, '')), ''),
      coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Quote'),
      v_priced -> 'lines',
      v_subtotal,
      v_discount,
      v_subtotal - v_discount,
      nullif(trim(coalesce(p_notes, '')), ''),
      p_due_at,
      lower(auth.jwt() ->> 'email')
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_invoice(
  bigint, text, text, text, text, jsonb, text, date, integer) from public;
revoke execute on function public.save_invoice(
  bigint, text, text, text, text, jsonb, text, date, integer) from anon;
grant execute on function public.save_invoice(
  bigint, text, text, text, text, jsonb, text, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- send_invoice — hand it to the client
--
-- Sending is what makes the pay link work: invoice_for_payment() below will
-- not answer for a draft. Re-sending an already-sent invoice is allowed (a
-- chased-up email is normal) and just moves the timestamp.
-- ---------------------------------------------------------------------------

create or replace function public.send_invoice(
  p_id       bigint,
  p_delivery text default 'both'
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
begin
  if not public.can_price_quotes() then
    raise exception 'not allowed';
  end if;

  if coalesce(p_delivery, '') not in ('email', 'portal', 'both') then
    raise exception 'delivery must be email, portal or both';
  end if;

  select * into v_row from public.invoices where id = p_id for update;
  if not found then
    raise exception 'unknown invoice';
  end if;
  if v_row.status = 'paid' then
    raise exception 'that invoice has already been paid';
  end if;
  if v_row.status = 'void' then
    raise exception 'that invoice was cancelled';
  end if;

  -- Stripe will not take less than fifty cents, so an invoice that cannot be
  -- paid should not be sent as though it could.
  if v_row.total_cents < 50 then
    raise exception 'put a price on the invoice before sending it';
  end if;

  if p_delivery in ('email', 'both')
     and coalesce(trim(v_row.client_email), '') = '' then
    raise exception 'no email address on this invoice to send to';
  end if;

  update public.invoices
     set status     = 'sent',
         delivery   = p_delivery,
         sent_at    = now(),
         updated_at = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_invoice(bigint, text) from public;
revoke execute on function public.send_invoice(bigint, text) from anon;
grant execute on function public.send_invoice(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- void_invoice — cancel one that is not going ahead
--
-- Kept rather than deleted, so a client who still has the emailed link is told
-- it was cancelled instead of being able to pay it.
-- ---------------------------------------------------------------------------

create or replace function public.void_invoice(p_id bigint)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
begin
  if not public.can_price_quotes() then
    raise exception 'not allowed';
  end if;

  select * into v_row from public.invoices where id = p_id for update;
  if not found then
    raise exception 'unknown invoice';
  end if;
  if v_row.status = 'paid' then
    raise exception 'that invoice has been paid and cannot be cancelled here';
  end if;

  update public.invoices
     set status = 'void', updated_at = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.void_invoice(bigint) from public;
revoke execute on function public.void_invoice(bigint) from anon;
grant execute on function public.void_invoice(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- invoice_for_payment — what the pay page is allowed to see
--
-- Anon-callable, because someone paying from an emailed link is not signed in.
-- The reference is a random uuid and is the only way in, exactly as the order
-- reference already works. Note what is NOT returned: no id, no project, no
-- internal notes, no email address — nothing that would make the link useful
-- to someone it wasn't sent to beyond the amount they are being asked for.
--
-- A draft or a voided invoice returns no row at all, so a link that went out
-- early, or for work that fell through, simply stops working.
-- ---------------------------------------------------------------------------

create or replace function public.invoice_for_payment(p_reference uuid)
returns table (
  reference      uuid,
  title          text,
  client_name    text,
  lines          jsonb,
  subtotal_cents integer,
  discount_cents integer,
  total_cents    integer,
  currency       text,
  notes          text,
  due_at         date,
  status         text,
  paid_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select i.reference, i.title, i.client_name, i.lines,
         i.subtotal_cents, i.discount_cents, i.total_cents, i.currency,
         i.notes, i.due_at, i.status, i.paid_at
  from public.invoices i
  where i.reference = p_reference
    and i.status in ('sent', 'paid');
$$;

revoke all on function public.invoice_for_payment(uuid) from public;
grant execute on function public.invoice_for_payment(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_invoice_paid — the webhook's entry point
--
-- Service role only. Idempotent, because Stripe retries: a second delivery of
-- the same event must not double-count anything.
--
-- Paying a quote also settles the project it came from — it stops being a
-- quote awaiting a price and becomes a paid job, which is what the pending
-- list is filtering on.
-- ---------------------------------------------------------------------------

create or replace function public.mark_invoice_paid(
  p_reference uuid,
  p_session   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
begin
  select * into v_row from public.invoices where reference = p_reference for update;
  if not found then
    raise exception 'unknown invoice';
  end if;

  if v_row.status = 'paid' then
    return;                        -- already handled; webhook retry
  end if;

  update public.invoices
     set status            = 'paid',
         paid_at           = now(),
         stripe_session_id = coalesce(p_session, stripe_session_id),
         updated_at        = now()
   where id = v_row.id;

  if v_row.project_id is not null then
    update public.projects
       set order_kind  = 'paid',
           amount_cents = coalesce(amount_cents, 0) + v_row.total_cents
     where id = v_row.project_id;
  end if;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, text) from public;
revoke execute on function public.mark_invoice_paid(uuid, text) from anon;
revoke execute on function public.mark_invoice_paid(uuid, text) from authenticated;
