-- DigiCode — lets Devs delete chat messages (e.g. test/erroneous entries).
create policy "Devs can delete chats"
  on public.chats for delete
  using (public.is_dev());
