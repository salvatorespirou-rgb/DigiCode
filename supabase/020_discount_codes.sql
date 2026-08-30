-- DigiCode — discount codes for checkout.
-- Run this once in the Supabase SQL Editor, after 019_visitor_chat_delete.sql.
--
-- Someone at the checkout is not signed in, so validating a code has the same
-- shape as the visitor chat: the table is closed to anon entirely, and the one
-- thing a shopper can do goes through a SECURITY DEFINER function that takes a
-- code and hands back only that code's terms. It cannot be used to list codes,
-- and a wrong guess returns the same "not valid" as an expired one.
--
-- Creating and managing codes is narrower still — see can_manage_discount_codes
-- at the bottom, which follows the same rule as deleting live chats: Lead
-- Developers, anyone granted the permission, and the owner account.

create table public.discount_codes (
  id          bigint generated always as identity primary key,
  code        text not null,
  kind        text not null check (kind in ('percent', 'fixed')),
  amount      numeric(10, 2) not null check (amount > 0),
  applies_to  text not null default 'both' check (applies_to in ('one_time', 'subscription', 'both')),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    int,                       -- null means unlimited
  times_used  int not null default 0,
  active      boolean not null default true,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),

  -- A percentage over 100 would pay the customer.
  constraint discount_percent_in_range
    check (kind <> 'percent' or amount <= 100),

  -- The brief caps a code's life at 30 days. Enforced here rather than in the
  -- portal so it holds however the row was created.
  constraint discount_window_max_30_days
    check (expires_at > starts_at and expires_at <= starts_at + interval '30 days')
);

-- Codes are matched case-insensitively, so uniqueness has to be too.
create unique index discount_codes_code_idx on public.discount_codes (upper(code));

alter table public.discount_codes enable row level security;

-- Every dev can see the codes; only the permitted ones can change them.
create policy "Devs can view discount codes"
  on public.discount_codes for select
  using (public.is_dev());


-- ---------------------------------------------------------------------------
-- Shopper side. One function, no table access.
-- ---------------------------------------------------------------------------

-- Returns the code's terms if it is currently usable, or no rows at all.
-- Deliberately does not say *why* a code failed — an attacker probing the
-- endpoint learns nothing beyond "not usable right now".
create or replace function public.validate_discount_code(p_code text)
returns table (
  code       text,
  kind       text,
  amount     numeric,
  applies_to text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select d.code, d.kind, d.amount, d.applies_to, d.expires_at
  from public.discount_codes d
  where upper(d.code) = upper(trim(coalesce(p_code, '')))
    and d.active
    and now() >= d.starts_at
    and now() < d.expires_at
    and (d.max_uses is null or d.times_used < d.max_uses)
  limit 1;
$$;

-- Counts a use at the moment an order is actually placed. Re-checks the same
-- conditions, so a code that expired between validating and confirming does
-- not get counted.
create or replace function public.redeem_discount_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit int;
begin
  update public.discount_codes
     set times_used = times_used + 1
   where upper(code) = upper(trim(coalesce(p_code, '')))
     and active
     and now() >= starts_at
     and now() < expires_at
     and (max_uses is null or times_used < max_uses);

  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

revoke all on function public.validate_discount_code(text) from public;
revoke all on function public.redeem_discount_code(text) from public;
grant execute on function public.validate_discount_code(text) to anon, authenticated;
grant execute on function public.redeem_discount_code(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Who may create and manage codes. Same rule as deleting live chats.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_discount_codes()
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
           and (rank = 'Lead Developer' or permissions ? 'Manage Discount Codes')
       )
     );
$$;

revoke all on function public.can_manage_discount_codes() from public;
grant execute on function public.can_manage_discount_codes() to authenticated;

create policy "Permitted devs can create discount codes"
  on public.discount_codes for insert
  with check (public.can_manage_discount_codes());

create policy "Permitted devs can update discount codes"
  on public.discount_codes for update
  using (public.can_manage_discount_codes())
  with check (public.can_manage_discount_codes());

create policy "Permitted devs can delete discount codes"
  on public.discount_codes for delete
  using (public.can_manage_discount_codes());
