-- Velora Digital — lets Devs delete a project row (e.g. spam/duplicate/test entries).
create policy "Devs can delete projects"
  on public.projects for delete
  using (public.is_dev());
