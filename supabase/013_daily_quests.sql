-- DigiCode — Daily Quests. Ten quests, all reset every day — a
-- completely separate cadence from the weekly leaderboard reset
-- (012_weekly_leaderboard_reset.sql, which stays weekly and untouched
-- here), so this is its own columns, its own cron job, and its own
-- functions rather than piggybacking on the weekly one.
alter table public.game_players
  add column if not exists daily_coins_collected integer not null default 0,
  add column if not exists daily_pylons_cleared integer not null default 0,
  add column if not exists daily_pylons_broken integer not null default 0,
  add column if not exists daily_coin_rush_survived integer not null default 0,
  add column if not exists daily_jet_chase_survived integer not null default 0,
  add column if not exists daily_rage_survived integer not null default 0,
  add column if not exists daily_runs_played integer not null default 0,
  -- Score-threshold quests ("reach 1,000 in a run") can't reuse best_score
  -- since that only resets weekly — this is its own daily high-water mark,
  -- bumped via GREATEST() in record_daily_progress() below so an
  -- out-of-order write can never accidentally lower it.
  add column if not exists daily_best_score integer not null default 0,
  add column if not exists daily_quests_claimed text[] not null default '{}';

create extension if not exists pg_cron with schema extensions;

create or replace function public.reset_daily_quests()
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players set
    daily_coins_collected = 0,
    daily_pylons_cleared = 0,
    daily_pylons_broken = 0,
    daily_coin_rush_survived = 0,
    daily_jet_chase_survived = 0,
    daily_rage_survived = 0,
    daily_runs_played = 0,
    daily_best_score = 0,
    daily_quests_claimed = '{}';
$$;

-- Same UTC-offset reasoning as the weekly reset: AEST is a fixed UTC+10
-- (no daylight saving), so "every day 6am AEST" is always exactly "every
-- day 20:00 UTC" with no seasonal drift.
select cron.schedule(
  'daily-quest-reset',
  '0 20 * * *',
  $$select public.reset_daily_quests();$$
);

-- Called once per completed run (alongside the existing coin/best-score
-- write in endGame()) to add that run's quest-relevant stats onto today's
-- running totals. p_run_score is this run's final score, folded in via
-- GREATEST so it only ever raises daily_best_score, never lowers it.
create or replace function public.record_daily_progress(
  p_id uuid,
  p_edit_key text,
  p_coins_collected integer default 0,
  p_pylons_cleared integer default 0,
  p_pylons_broken integer default 0,
  p_coin_rush integer default 0,
  p_jet_chase integer default 0,
  p_rage integer default 0,
  p_runs integer default 0,
  p_run_score integer default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players
  set daily_coins_collected = daily_coins_collected + p_coins_collected,
      daily_pylons_cleared = daily_pylons_cleared + p_pylons_cleared,
      daily_pylons_broken = daily_pylons_broken + p_pylons_broken,
      daily_coin_rush_survived = daily_coin_rush_survived + p_coin_rush,
      daily_jet_chase_survived = daily_jet_chase_survived + p_jet_chase,
      daily_rage_survived = daily_rage_survived + p_rage,
      daily_runs_played = daily_runs_played + p_runs,
      daily_best_score = greatest(daily_best_score, p_run_score)
  where id = p_id and edit_key = p_edit_key;
$$;

-- Atomic claim: credits the reward and records the quest as claimed in one
-- guarded UPDATE, so a double-click (or the same account open in two tabs)
-- can't pay out twice — same guarded-write pattern as the best_score
-- race-condition fix (.lt("best_score", score)). Returns the new balance,
-- or no row at all if it was already claimed / the id+edit_key didn't
-- match — the app treats a null/empty result as "don't trust this, resync."
create or replace function public.claim_daily_quest(p_id uuid, p_edit_key text, p_quest_id text, p_amount bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.game_players
  set coins = coins + p_amount,
      daily_quests_claimed = array_append(daily_quests_claimed, p_quest_id)
  where id = p_id
    and edit_key = p_edit_key
    and not (p_quest_id = any(daily_quests_claimed))
  returning coins;
$$;
