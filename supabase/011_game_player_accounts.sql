-- DigiCode — links a game_players row to a real Supabase Auth
-- account, so a player's profile (score, coins, dragons) follows them
-- across devices once they sign in with the same email, using the same
-- email one-time-code auth the portal already has. No password means
-- nothing to reset — losing access just means requesting a new code.
-- Anonymous play keeps working exactly as before via edit_key; no
-- existing policies are touched.
alter table public.game_players
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One game profile per account.
create unique index if not exists game_players_user_id_key
  on public.game_players (user_id) where user_id is not null;
