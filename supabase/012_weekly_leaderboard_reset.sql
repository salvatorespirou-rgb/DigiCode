-- Velora Digital — weekly leaderboard reset. Zeroes every player's
-- best_score only — display name, avatar, coins, owned dragons, and any
-- linked account all stay exactly as they are. Runs automatically every
-- Monday 6am AEST, and this migration also runs it once immediately.
--
-- pg_cron schedules run in UTC. AEST is a fixed UTC+10 offset (unlike
-- AEDT, it does not observe daylight saving), so "every Monday 6am AEST"
-- is always exactly "every Sunday 20:00 UTC" — no seasonal drift.
create extension if not exists pg_cron with schema extensions;

create or replace function public.reset_weekly_leaderboard()
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_players set best_score = 0, updated_at = now();
$$;

select cron.schedule(
  'weekly-leaderboard-reset',
  '0 20 * * 0',
  $$select public.reset_weekly_leaderboard();$$
);

-- Run once now for the immediate "clear scores, keep players" reset.
select public.reset_weekly_leaderboard();
