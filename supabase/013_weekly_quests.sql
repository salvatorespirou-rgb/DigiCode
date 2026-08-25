-- Velora Digital — Weekly Quests. Adds per-player weekly progress counters
-- and a claimed-quest list, both reset by the same Monday cron job that
-- already zeroes best_score (012_weekly_leaderboard_reset.sql) — no new
-- cron job needed since it's the same "everything for the week" reset,
-- just a wider function body. CREATE OR REPLACE picks that up in place;
-- the existing schedule keeps calling reset_weekly_leaderboard() by name.
alter table public.game_players
  add column if not exists weekly_coins_collected integer not null default 0,
  add column if not exists weekly_pylons_cleared integer not null default 0,
  add column if not exists weekly_pylons_broken integer not null default 0,
  add column if not exists weekly_coin_rush_survived integer not null default 0,
  add column if not exists weekly_jet_chase_survived integer not null default 0,
  add column if not exists weekly_rage_survived integer not null default 0,
  add column if not exists weekly_runs_played integer not null default 0,
  add column if not exists weekly_quests_claimed text[] not null default '{}';

create or replace function public.reset_weekly_leaderboard()
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players set
    best_score = 0,
    weekly_coins_collected = 0,
    weekly_pylons_cleared = 0,
    weekly_pylons_broken = 0,
    weekly_coin_rush_survived = 0,
    weekly_jet_chase_survived = 0,
    weekly_rage_survived = 0,
    weekly_runs_played = 0,
    weekly_quests_claimed = '{}',
    updated_at = now();
$$;

-- Called once per completed run (alongside the existing coin/best-score
-- write in endGame()) to add that run's quest-relevant stats onto the
-- week's running totals. All params default to 0 so a run only needs to
-- pass the counters it actually moved.
create or replace function public.record_weekly_progress(
  p_id uuid,
  p_edit_key text,
  p_coins_collected integer default 0,
  p_pylons_cleared integer default 0,
  p_pylons_broken integer default 0,
  p_coin_rush integer default 0,
  p_jet_chase integer default 0,
  p_rage integer default 0,
  p_runs integer default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players
  set weekly_coins_collected = weekly_coins_collected + p_coins_collected,
      weekly_pylons_cleared = weekly_pylons_cleared + p_pylons_cleared,
      weekly_pylons_broken = weekly_pylons_broken + p_pylons_broken,
      weekly_coin_rush_survived = weekly_coin_rush_survived + p_coin_rush,
      weekly_jet_chase_survived = weekly_jet_chase_survived + p_jet_chase,
      weekly_rage_survived = weekly_rage_survived + p_rage,
      weekly_runs_played = weekly_runs_played + p_runs
  where id = p_id and edit_key = p_edit_key;
$$;

-- Atomic claim: credits the reward and records the quest as claimed in one
-- guarded UPDATE, so a double-click (or the same account open in two tabs)
-- can't pay out twice — the "not already in the array" check and the
-- credit happen atomically, same guarded-write pattern as the best_score
-- race-condition fix (.lt("best_score", score)). Returns the new balance,
-- or no row at all if it was already claimed / the id+edit_key didn't
-- match — the app treats a null/empty result as "don't trust this, resync."
create or replace function public.claim_weekly_quest(p_id uuid, p_edit_key text, p_quest_id text, p_amount bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.game_players
  set coins = coins + p_amount,
      weekly_quests_claimed = array_append(weekly_quests_claimed, p_quest_id)
  where id = p_id
    and edit_key = p_edit_key
    and not (p_quest_id = any(weekly_quests_claimed))
  returning coins;
$$;
