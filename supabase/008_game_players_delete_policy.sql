-- Velora Digital — lets Devs delete a game_players row (moderation/cleanup;
-- e.g. an inappropriate name, or test data).
create policy "Devs can delete players"
  on public.game_players for delete
  using (public.is_dev());
