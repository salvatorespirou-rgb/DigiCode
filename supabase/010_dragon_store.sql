-- DigiCode — Dragon Store: a persistent coin wallet, which dragons a
-- player owns, and which one they currently fly. No new RLS policies are
-- needed — game_players already has an open UPDATE policy and every write
-- from the app is scoped with .eq("edit_key", ...), same as best_score.
alter table public.game_players
  add column if not exists coins bigint not null default 0,
  add column if not exists owned_dragons text[] not null default '{}',
  add column if not exists equipped_dragon text;

-- Atomic coin credit at the end of a run — avoids a read-then-write race if
-- a player has the game open in two tabs. Returns the new balance.
create or replace function public.credit_coins(p_id uuid, p_edit_key text, p_amount bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.game_players
  set coins = coins + p_amount
  where id = p_id and edit_key = p_edit_key
  returning coins;
$$;
